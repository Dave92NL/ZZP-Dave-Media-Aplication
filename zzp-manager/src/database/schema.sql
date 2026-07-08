-- ZZP Manager — SQLite Schema

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- Application settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Company profile
CREATE TABLE IF NOT EXISTS company_profile (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  address TEXT DEFAULT '',
  postcode TEXT DEFAULT '',
  city TEXT DEFAULT '',
  country TEXT DEFAULT 'Nederland',
  kvk_number TEXT DEFAULT '',
  btw_number TEXT DEFAULT '',
  iban TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  logo_path TEXT DEFAULT '',
  invoice_prefix TEXT DEFAULT 'FV',
  invoice_next_number INTEGER DEFAULT 1,
  default_payment_days INTEGER DEFAULT 30,
  default_hourly_rate REAL DEFAULT 0,
  default_currency TEXT DEFAULT 'EUR',
  invoice_footer TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Clients / CRM
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  company_name TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  postcode TEXT DEFAULT '',
  city TEXT DEFAULT '',
  country TEXT DEFAULT '',
  vat_number TEXT DEFAULT '',
  btw_rate REAL DEFAULT 0,
  btw_reverse_charge INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'EUR',
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Client interaction history
CREATE TABLE IF NOT EXISTS client_interactions (
  id INTEGER PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  subject TEXT DEFAULT '',
  content TEXT DEFAULT '',
  date DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Client files
CREATE TABLE IF NOT EXISTS client_files (
  id INTEGER PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  filesize INTEGER DEFAULT 0,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  client_id INTEGER REFERENCES clients(id),
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  start_date DATE,
  end_date DATE,
  hourly_rate REAL DEFAULT 0,
  budget_hours REAL DEFAULT 0,
  budget_amount REAL DEFAULT 0,
  currency TEXT DEFAULT 'EUR',
  youtube_episode TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  client_id INTEGER REFERENCES clients(id),
  project_id INTEGER REFERENCES projects(id),
  status TEXT DEFAULT 'draft',
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  paid_date DATE,
  currency TEXT DEFAULT 'EUR',
  exchange_rate REAL DEFAULT 1.0,
  subtotal REAL NOT NULL DEFAULT 0,
  btw_rate REAL DEFAULT 0,
  btw_amount REAL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  total_eur REAL DEFAULT 0,
  notes TEXT DEFAULT '',
  reference TEXT DEFAULT '',
  btw_reverse_charge INTEGER DEFAULT 0,
  pdf_path TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Invoice line items
CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'szt',
  unit_price REAL NOT NULL DEFAULT 0,
  btw_rate REAL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

-- Time entries
CREATE TABLE IF NOT EXISTS time_entries (
  id INTEGER PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  invoice_id INTEGER REFERENCES invoices(id),
  category TEXT NOT NULL DEFAULT 'Inne',
  description TEXT DEFAULT '',
  start_time DATETIME,
  end_time DATETIME,
  duration_minutes INTEGER DEFAULT 0,
  is_pomodoro INTEGER DEFAULT 0,
  is_billable INTEGER DEFAULT 1,
  date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  category TEXT NOT NULL DEFAULT 'Inne',
  description TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'EUR',
  exchange_rate REAL DEFAULT 1.0,
  amount_eur REAL DEFAULT 0,
  btw_rate REAL DEFAULT 0,
  btw_amount REAL DEFAULT 0,
  btw_deductible INTEGER DEFAULT 1,
  date DATE NOT NULL,
  vendor TEXT DEFAULT '',
  receipt_path TEXT DEFAULT '',
  is_deductible INTEGER DEFAULT 1,
  notes TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Income entries
CREATE TABLE IF NOT EXISTS income_entries (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'Other',
  description TEXT DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'EUR',
  exchange_rate REAL DEFAULT 1.0,
  amount_eur REAL NOT NULL DEFAULT 0,
  date DATE NOT NULL,
  invoice_id INTEGER REFERENCES invoices(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'todo',
  due_date DATE,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Notes (Markdown)
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  project_id INTEGER REFERENCES projects(id),
  invoice_id INTEGER REFERENCES invoices(id),
  tags TEXT DEFAULT '[]',
  is_pinned INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Reminders / Notifications
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  type TEXT NOT NULL DEFAULT 'custom',
  due_date DATE NOT NULL,
  due_time TEXT DEFAULT '09:00',
  is_recurring INTEGER DEFAULT 0,
  recurrence_pattern TEXT DEFAULT '',
  is_dismissed INTEGER DEFAULT 0,
  last_notified_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- AdSense import history
CREATE TABLE IF NOT EXISTS adsense_imports (
  id INTEGER PRIMARY KEY,
  filename TEXT NOT NULL,
  import_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  period_start DATE,
  period_end DATE,
  total_amount REAL DEFAULT 0,
  currency TEXT DEFAULT 'EUR',
  rows_imported INTEGER DEFAULT 0
);

-- YouTube / channel statistics
CREATE TABLE IF NOT EXISTS youtube_stats (
  id INTEGER PRIMARY KEY,
  date DATE NOT NULL,
  views INTEGER DEFAULT 0,
  watch_time_hours REAL DEFAULT 0,
  subscribers_gained INTEGER DEFAULT 0,
  subscribers_lost INTEGER DEFAULT 0,
  estimated_revenue REAL DEFAULT 0,
  currency TEXT DEFAULT 'EUR',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(date)
);

-- Backup history
CREATE TABLE IF NOT EXISTS backup_history (
  id INTEGER PRIMARY KEY,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  filesize INTEGER DEFAULT 0,
  status TEXT DEFAULT 'success',
  error_message TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(date);
CREATE INDEX IF NOT EXISTS idx_time_entries_project ON time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date, status);
CREATE INDEX IF NOT EXISTS idx_notes_project ON notes(project_id);
CREATE INDEX IF NOT EXISTS idx_income_date ON income_entries(date);
