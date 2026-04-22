# A Thought for Me

A multi-user daily wisdom web application delivering a passage from the works of Idries Shah to each registered user. Every user receives a new passage each day, presented in a persistent chronological thread. No passage is ever repeated for the same user.

---

## Features

- **Daily Thought Delivery** — one passage per day, balanced across books and types
- **Thread View** — scrollable feed of every passage received, newest first
- **Today's Thought** — prominently displayed at the top of the thread
- **Favourites** — heart any passage to save it to your personal favourites list
- **Settings** — configure your preferred delivery time, timezone, and email notifications
- **Dark Mode** — warm dark tones, auto-detected from system preference
- **518 passages** — stories, aphorisms, reflections, poems and dialogues from 17 books

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript |
| Styling | Tailwind CSS v3, shadcn/ui |
| Backend | Express.js |
| Auth | Supabase Auth (email + password) |
| Database | Supabase PostgreSQL |
| Hosting | Vercel (free tier) |
| Email | Resend (optional, free tier) |
| Content | `passages.json` — 518 passages bundled with app |

---

## Local Development

### Prerequisites

- Node.js 18+
- npm 9+

### Setup

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/Idries-Shah-A-Thought-for-Me.git
cd Idries-Shah-A-Thought-for-Me

# Install dependencies
npm install

# Copy and populate environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# Start the development server
npm run dev
```

The app runs at `http://localhost:5000`.

In development, the app uses **in-memory storage** — no database required. All data resets on server restart.

---

## Supabase Setup (Production)

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **Settings → API** and copy:
   - Project URL → `SUPABASE_URL`
   - `anon` public key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`
3. Open the **SQL Editor** and run the contents of `supabase-migrations.sql`
4. Enable **Email Auth** in Authentication → Providers

---

## Deploying to Vercel

### First Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy (follow prompts)
vercel

# Set environment variables
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add SUPABASE_ANON_KEY
vercel env add CRON_SECRET
vercel env add RESEND_API_KEY   # optional

# Redeploy with env vars
vercel --prod
```

### Connect to GitHub

1. Push the repository to GitHub as `Idries-Shah-A-Thought-for-Me`
2. In Vercel dashboard, import the GitHub repo
3. Set environment variables in **Settings → Environment Variables**
4. Subsequent pushes to `main` trigger automatic deployments

---

## Daily Delivery Cron

The Vercel cron (`vercel.json`) runs `GET /api/cron/deliver` **every hour**. It checks which users are due for their daily delivery (based on their preferred time and timezone) and delivers a new passage to each.

### Cron Endpoint Security

The endpoint is protected by a `CRON_SECRET` token. Vercel automatically adds this via the `Authorization: Bearer <secret>` header. To run manually:

```bash
curl -X GET "https://your-app.vercel.app/api/cron/deliver" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

---

## Passage Selection Logic

Each daily delivery:

1. Queries the user's `deliveries` table — never repeats a seen passage
2. Balances across **books** — prefers books with fewer deliveries to date
3. Balances across **types** — alternates between stories, aphorisms, reflections, poems
4. Applies mild **theme diversity** — avoids consecutive same-theme deliveries
5. Picks randomly from the top 20% of candidates to prevent predictability

---

## Content Index

518 passages from 17 Idries Shah books, stored in `client/public/passages.json`.

| Book | Passages |
|---|---|
| Tales of the Dervishes | 45 |
| Reflections | 45 |
| The Pleasantries of the Incredible Mulla Nasrudin | 40 |
| The Subtleties of the Inimitable Mulla Nasrudin | 40 |
| The World of Nasrudin | 35 |
| Knowing How to Know | 30 |
| The Magic Monastery | 30 |
| Thinkers of the East | 30 |
| Wisdom of the Idiots | 30 |
| Caravan of Dreams | 25 |
| The Commanding Self | 25 |
| The Way of the Sufi | 25 |
| The Exploits of the Incomparable Mulla Nasrudin | 38 |
| A Perfumed Scorpion | 20 |
| Learning How to Learn | 20 |
| Seeker After Truth | 20 |
| The Idries Shah Anthology | 20 |

---

## Adding More Passages

Edit `client/public/passages.json`. Each passage requires:

```json
{
  "passage_id": "XX001",
  "title": "Passage title or first few words",
  "book": "Book Name",
  "page": "42",
  "text": "Full passage text...",
  "type": "story | aphorism | reflection | dialogue | poem",
  "length": 120,
  "themes": ["perception", "learning"]
}
```

Passage IDs must be unique across the entire file.

---

## Email Notifications (Optional)

1. Sign up at [resend.com](https://resend.com) — free tier: 3,000 emails/month
2. Add your API key as `RESEND_API_KEY`
3. Users can enable email notifications in **Settings**
4. The cron job sends the passage text in a minimal HTML email

---

## Maintenance & Monitoring

A weekly Computer task monitors:
- Vercel error logs and function execution
- Daily delivery completion rates
- Passage pool levels (alerts when remaining < 100 per active user)

---

*Built with [Perplexity Computer](https://www.perplexity.ai/computer)*
