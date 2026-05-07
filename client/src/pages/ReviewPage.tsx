import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Search, Trash2, Pencil, RotateCcw, Download, BookOpen, AlertTriangle, ExternalLink, Plus } from "lucide-react";

interface Passage {
  id: string;
  title: string;
  text: string;
  source: string;
  page: number | null;
  deleted: boolean;
  note: string | null;
  created_at?: string;
  updated_at?: string;
}

interface Book {
  name: string;
  slug: string;
  page_offset: number;
}

const PAGE_SIZE = 40;

function hasGarbledTitle(p: Passage) {
  const t = p.title;
  return (
    (t.length > 50 && t[0] === t[0].toLowerCase() && /[a-z]/.test(t[0])) ||
    t.includes("\n") ||
    /\b(the|a|an|of|in|and|to|for|is|are|was|with|by|from|at|on|as|it|its|this|that)$/i.test(t.trim())
  );
}

function getIssues(p: Passage): string[] {
  const issues: string[] = [];
  if (hasGarbledTitle(p)) issues.push("garbled title");
  if (p.text.length > 8000) issues.push("very long");
  if (p.text.length < 100) issues.push("very short");
  return issues;
}

// ── Supabase data fetchers ────────────────────────────────────────────────────

async function fetchStats(): Promise<{ total: number; deleted: number; active: number }> {
  const { data, error } = await supabase
    .from("passages")
    .select("id, deleted");
  if (error) throw error;
  const total = (data ?? []).length;
  const deleted = (data ?? []).filter((p: { deleted: boolean }) => p.deleted).length;
  return { total, deleted, active: total - deleted };
}

async function fetchSources(): Promise<string[]> {
  const { data, error } = await supabase
    .from("passages")
    .select("source")
    .eq("deleted", false);
  if (error) throw error;
  const set = new Set((data ?? []).map((p: { source: string }) => p.source));
  return Array.from(set).sort();
}

async function fetchBooks(): Promise<Map<string, Book>> {
  const { data, error } = await supabase
    .from("books")
    .select("name, slug, page_offset");
  if (error) throw error;
  const map = new Map<string, Book>();
  for (const b of (data ?? []) as Book[]) map.set(b.name, b);
  return map;
}

interface FetchPassagesArgs {
  search: string;
  source: string;
  issue: string;
  showDeleted: boolean;
  page: number;
}

async function fetchPassages({ search, source, issue, showDeleted, page }: FetchPassagesArgs): Promise<{ items: Passage[]; total: number }> {
  // Build query — fetch all matching rows (Supabase doesn't easily do server-side issue filtering)
  let query = supabase
    .from("passages")
    .select("id, title, text, source, page, deleted, note, created_at, updated_at");

  if (!showDeleted) query = query.eq("deleted", false);
  if (source && source !== "all") query = query.eq("source", source);
  if (search) {
    query = query.or(`title.ilike.%${search}%,text.ilike.%${search}%`);
  }

  const { data, error } = await query.order("source").order("page");
  if (error) throw error;

  let items = (data ?? []) as Passage[];

  // Client-side issue filter
  if (issue === "garbled_title") items = items.filter(p => hasGarbledTitle(p));
  else if (issue === "very_long") items = items.filter(p => p.text.length > 8000);
  else if (issue === "very_short") items = items.filter(p => p.text.length < 100);

  const total = items.length;
  const start = (page - 1) * PAGE_SIZE;
  return { items: items.slice(start, start + PAGE_SIZE), total };
}

// ── ISF URL builder ───────────────────────────────────────────────────────────

function isfUrl(bookMap: Map<string, Book>, source: string, page: number | null): string {
  const book = bookMap.get(source);
  const slug = book?.slug ??
    source.toLowerCase().replace(/[''']/g, "").replace(/[^a-z0-9\s-]/g, "")
      .trim().replace(/\s+/g, "-").replace(/-+/g, "-");
  const base = `https://idriesshahfoundation.org/pdfviewer/${slug}/?auto_viewer=true`;
  if (page == null || page === 0) return base;
  return `${base}#page=${page + (book?.page_offset ?? 0)}`;
}

// ── Slugify ───────────────────────────────────────────────────────────────────

function slugify(title: string, page: string): string {
  const slug = title.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60)
    .replace(/-$/, "");
  return page ? `${slug}-${page}` : slug;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [source, setSource] = useState("all");
  const [issue, setIssue] = useState("all");
  const [showDeleted, setShowDeleted] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Passage | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editText, setEditText] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editPage, setEditPage] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState<Passage | null>(null);

  // New passage state
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newText, setNewText] = useState("");
  const [newSource, setNewSource] = useState("");
  const [newCustomSource, setNewCustomSource] = useState("");
  const [newPage, setNewPage] = useState("");

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [source, issue, showDeleted]);

  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: fetchStats,
  });

  const { data: sources = [] } = useQuery({
    queryKey: ["sources"],
    queryFn: fetchSources,
  });

  const { data: bookMap = new Map<string, Book>() } = useQuery({
    queryKey: ["books"],
    queryFn: fetchBooks,
    staleTime: Infinity,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["passages", debouncedSearch, source, issue, showDeleted, page],
    queryFn: () => fetchPassages({ search: debouncedSearch, source, issue, showDeleted, page }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("passages").update({ deleted: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["passages"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast({ title: "Passage deleted" });
      setConfirmDelete(null);
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("passages").update({ deleted: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["passages"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast({ title: "Passage restored" });
    },
    onError: (e: Error) => toast({ title: "Restore failed", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const { error } = await supabase.from("passages").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["passages"] });
      toast({ title: "Passage updated" });
      setEditing(null);
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async (row: { id: string; title: string; text: string; source: string; page: number | null }) => {
      // Check for duplicate ID
      const { data: existing } = await supabase.from("passages").select("id").eq("id", row.id).single();
      if (existing) throw new Error("A passage with this ID already exists");
      const { error } = await supabase.from("passages").insert({ ...row, deleted: false });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["passages"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["sources"] });
      toast({ title: "Passage created" });
      setShowNewDialog(false);
      setNewTitle(""); setNewText(""); setNewSource(""); setNewCustomSource(""); setNewPage("");
    },
    onError: (e: Error) => toast({ title: "Error creating passage", description: e.message, variant: "destructive" }),
  });

  const openEdit = (p: Passage) => {
    setEditing(p);
    setEditTitle(p.title);
    setEditText(p.text);
    setEditNote(p.note ?? "");
    setEditPage(p.page != null ? String(p.page) : "");
  };

  const saveEdit = () => {
    if (!editing) return;
    const dbData: Record<string, unknown> = {
      title: editTitle,
      text: editText,
      note: editNote || null,
    };
    if (editPage !== "") dbData.page = parseInt(editPage) || null;
    updateMutation.mutate({ id: editing.id, data: dbData });
  };

  const saveNew = () => {
    const effectiveSource = newSource === "__custom__" ? newCustomSource.trim() : newSource;
    if (!newTitle.trim() || !newText.trim() || !effectiveSource) return;
    const id = slugify(newTitle.trim(), newPage.trim());
    createMutation.mutate({
      id,
      title: newTitle.trim(),
      text: newText.trim(),
      source: effectiveSource,
      page: newPage.trim() ? parseInt(newPage.trim()) : null,
    });
  };

  const handleExport = async () => {
    try {
      const { data, error } = await supabase
        .from("passages")
        .select("id, title, text, source, page")
        .eq("deleted", false)
        .order("source")
        .order("page");
      if (error) throw error;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "passages.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast({ title: "Export failed", description: String(e), variant: "destructive" });
    }
  };

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  return (
    <div className="min-h-screen bg-background font-sans">
      {/* Header */}
      <header className="border-b bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Passage Reviewer</h1>
          {stats && (
            <div className="flex gap-2 ml-2">
              <Badge variant="secondary" className="font-sans text-xs">{stats.active} active</Badge>
              {stats.deleted > 0 && (
                <Badge variant="destructive" className="font-sans text-xs">{stats.deleted} deleted</Badge>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            className="font-sans text-sm gap-1.5"
            onClick={() => setShowNewDialog(true)}
            data-testid="button-new-passage"
          >
            <Plus className="h-4 w-4" />
            New passage
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="font-sans text-sm gap-1.5 text-primary"
            onClick={handleExport}
            data-testid="button-export"
          >
            <Download className="h-4 w-4" />
            Export passages.json
          </Button>
        </div>
      </header>

      {/* Filters */}
      <div className="border-b bg-card px-6 py-3 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search title or text…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 font-sans text-sm"
            data-testid="input-search"
          />
        </div>

        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-56 font-sans text-sm" data-testid="select-source">
            <SelectValue placeholder="All books" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All books</SelectItem>
            {sources.map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={issue} onValueChange={v => { setIssue(v); setPage(1); }}>
          <SelectTrigger className="w-44 font-sans text-sm" data-testid="select-issue">
            <SelectValue placeholder="All passages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All passages</SelectItem>
            <SelectItem value="garbled_title">Garbled title</SelectItem>
            <SelectItem value="very_long">Very long (&gt;8000 chars)</SelectItem>
            <SelectItem value="very_short">Very short (&lt;100 chars)</SelectItem>
          </SelectContent>
        </Select>

        <label className="flex items-center gap-2 text-sm font-sans text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={showDeleted}
            onChange={e => setShowDeleted(e.target.checked)}
            className="rounded"
            data-testid="checkbox-show-deleted"
          />
          Show deleted
        </label>

        {(search || source !== "all" || issue !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="font-sans text-xs"
            onClick={() => { setSearch(""); setSource("all"); setIssue("all"); setPage(1); }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Results count */}
      <div className="px-6 py-2 text-xs text-muted-foreground font-sans border-b bg-muted/30">
        {isLoading ? "Loading…" : `${data?.total ?? 0} passages`}
        {data && data.total > PAGE_SIZE && ` · Page ${page} of ${totalPages}`}
      </div>

      {/* Passage list */}
      <div className="divide-y">
        {isLoading && (
          <div className="p-8 text-center text-muted-foreground font-sans text-sm">Loading…</div>
        )}
        {!isLoading && data?.items.length === 0 && (
          <div className="p-8 text-center text-muted-foreground font-sans text-sm">No passages found</div>
        )}
        {data?.items.map(p => {
          const issues = getIssues(p);
          return (
            <div
              key={p.id}
              className={`px-6 py-4 hover:bg-muted/40 transition-colors ${p.deleted ? "opacity-50" : ""}`}
              data-testid={`passage-row-${p.id}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  {/* Title row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-foreground leading-snug" data-testid={`text-title-${p.id}`}>
                      {p.title || <em className="text-muted-foreground">(no title)</em>}
                    </span>
                    {issues.map(iss => (
                      <Badge key={iss} variant="outline" className="font-sans text-xs text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3 mr-1" />{iss}
                      </Badge>
                    ))}
                    {p.deleted && <Badge variant="destructive" className="font-sans text-xs">deleted</Badge>}
                  </div>

                  {/* Source + page + ISF link */}
                  <div className="text-xs text-muted-foreground font-sans mt-0.5 flex items-center gap-2 flex-wrap">
                    <span><em>{p.source}</em>{p.page ? `, p. ${p.page}` : ""}</span>
                    <a
                      href={isfUrl(bookMap, p.source, p.page)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                      data-testid={`link-isf-${p.id}`}
                    >
                      <ExternalLink className="h-3 w-3" />Read online
                    </a>
                    {p.note && <span className="text-amber-600">· {p.note}</span>}
                  </div>

                  {/* Text preview */}
                  <p className="mt-1.5 text-sm text-foreground/80 leading-relaxed line-clamp-3">
                    {p.text}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0 mt-0.5">
                  {p.deleted ? (
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => restoreMutation.mutate(p.id)}
                      className="font-sans text-xs h-8"
                      data-testid={`button-restore-${p.id}`}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => openEdit(p)}
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        data-testid={`button-edit-${p.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => setConfirmDelete(p)}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        data-testid={`button-delete-${p.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-3 py-6 border-t font-sans">
          <Button
            variant="outline" size="sm"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            data-testid="button-prev-page"
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} / {totalPages}</span>
          <Button
            variant="outline" size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            data-testid="button-next-page"
          >
            Next
          </Button>
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent className="max-w-2xl font-sans">
          <DialogHeader>
            <DialogTitle className="font-serif">Edit Passage</DialogTitle>
            {editing && (
              <p className="text-xs text-muted-foreground">
                <em>{editing.source}</em>{editing.page ? `, p. ${editing.page}` : ""}
              </p>
            )}
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Title</label>
              <Input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                className="font-serif"
                data-testid="input-edit-title"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Text</label>
              <Textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                rows={12}
                className="font-serif text-sm leading-relaxed resize-y"
                data-testid="textarea-edit-text"
              />
              <p className="text-xs text-muted-foreground mt-1">{editText.length} characters</p>
            </div>
            <div className="flex gap-4">
              <div className="w-32">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Page number</label>
                <Input
                  value={editPage}
                  onChange={e => setEditPage(e.target.value)}
                  placeholder="e.g. 42"
                  type="number"
                  min={1}
                  className="font-sans text-sm"
                  data-testid="input-edit-page"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Note (internal)</label>
                <Input
                  value={editNote}
                  onChange={e => setEditNote(e.target.value)}
                  placeholder="e.g. 'merged with next passage'"
                  className="font-sans text-sm"
                  data-testid="input-edit-note"
                />
              </div>
            </div>
            {editing && editPage && (
              <div className="text-xs text-muted-foreground font-sans">
                ISF link preview:{" "}
                <a
                  href={isfUrl(bookMap, editing.source, parseInt(editPage) || null)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {isfUrl(bookMap, editing.source, parseInt(editPage) || null)}
                </a>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} className="font-sans">Cancel</Button>
            <Button onClick={saveEdit} disabled={updateMutation.isPending} className="font-sans">
              {updateMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Passage dialog */}
      <Dialog open={showNewDialog} onOpenChange={open => { if (!open) { setShowNewDialog(false); setNewTitle(""); setNewText(""); setNewSource(""); setNewCustomSource(""); setNewPage(""); } }}>
        <DialogContent className="max-w-2xl font-sans">
          <DialogHeader>
            <DialogTitle className="font-serif">New Passage</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Title <span className="text-destructive">*</span></label>
              <Input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="e.g. The Legend of Nasrudin"
                className="font-serif"
                data-testid="input-new-title"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Text <span className="text-destructive">*</span></label>
              <Textarea
                value={newText}
                onChange={e => setNewText(e.target.value)}
                rows={10}
                placeholder="Passage text…"
                className="font-serif text-sm leading-relaxed resize-y"
                data-testid="textarea-new-text"
              />
              <p className="text-xs text-muted-foreground mt-1">{newText.length} characters</p>
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Book <span className="text-destructive">*</span></label>
                <Select value={newSource} onValueChange={setNewSource}>
                  <SelectTrigger className="font-sans text-sm" data-testid="select-new-source">
                    <SelectValue placeholder="Select a book…" />
                  </SelectTrigger>
                  <SelectContent>
                    {sources.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                    <SelectItem value="__custom__">Other (type below)…</SelectItem>
                  </SelectContent>
                </Select>
                {newSource === "__custom__" && (
                  <Input
                    value={newCustomSource}
                    onChange={e => setNewCustomSource(e.target.value)}
                    placeholder="Book title"
                    className="font-sans text-sm mt-2"
                    data-testid="input-new-custom-source"
                  />
                )}
              </div>

              <div className="w-32">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Page number</label>
                <Input
                  value={newPage}
                  onChange={e => setNewPage(e.target.value)}
                  placeholder="e.g. 42"
                  type="number"
                  min={1}
                  className="font-sans text-sm"
                  data-testid="input-new-page"
                />
              </div>
            </div>

            {newTitle && newPage && (newSource && newSource !== "__custom__" ? newSource : newCustomSource) && (
              <div className="text-xs text-muted-foreground font-sans">
                ISF link preview:{" "}
                <a
                  href={isfUrl(bookMap, newSource === "__custom__" ? newCustomSource : newSource, parseInt(newPage) || null)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {isfUrl(bookMap, newSource === "__custom__" ? newCustomSource : newSource, parseInt(newPage) || null)}
                </a>
              </div>
            )}

            {newTitle && (
              <div className="text-xs text-muted-foreground font-sans">
                ID: <code className="bg-muted px-1 py-0.5 rounded">{slugify(newTitle.trim(), newPage.trim())}</code>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)} className="font-sans">Cancel</Button>
            <Button
              onClick={saveNew}
              disabled={
                createMutation.isPending ||
                !newTitle.trim() ||
                !newText.trim() ||
                !(newSource && newSource !== "__custom__" ? newSource : newCustomSource.trim())
              }
              className="font-sans"
              data-testid="button-create-passage"
            >
              {createMutation.isPending ? "Creating…" : "Create passage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={open => !open && setConfirmDelete(null)}>
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this passage?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong className="font-serif">{confirmDelete?.title}</strong> from{" "}
              <em>{confirmDelete?.source}</em> will be marked as deleted. You can restore it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
