import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://tamqiesklcjetftnumpm.supabase.co'
const supabaseAnonKey = 'sb_publishable_sL8ajZ6pgoH7VKQBBIJ8dw_euJnw6le'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
