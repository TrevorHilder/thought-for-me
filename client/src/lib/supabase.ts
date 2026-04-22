import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://tamqiesklcjetftnumpm.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhbXFpZXNrbGNqZXRmdG51bXBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NDcwNTYsImV4cCI6MjA4OTMyMzA1Nn0.GdIQ85arC6nudteCvdB9oAE_4K58hG6ph4n8dHnexvI'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
