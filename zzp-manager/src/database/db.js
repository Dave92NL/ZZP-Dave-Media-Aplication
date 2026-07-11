'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let db = null;

function init() {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'zzp-manager.db');

  // Ensure userData directory exists
  fs.mkdirSync(userDataPath, { recursive: true });

  db = new Database(dbPath);

  // Performance + reliability pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -32000'); // 32MB cache
  db.pragma('temp_store = MEMORY');

  runMigrations();
  seedDefaults();

  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call db.init() first.');
  return db;
}

function runMigrations() {
  // Create schema version tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const currentVersion = db.prepare('SELECT MAX(version) as v FROM schema_version').get()?.v || 0;

  const migrations = getMigrations();
  for (const [version, sql] of migrations) {
    if (version > currentVersion) {
      // migrations can be arrays of statements for ALTER TABLE safety
      if (Array.isArray(sql)) {
        for (const stmt of sql) {
          try { db.exec(stmt); } catch (e) {
            // Ignore "duplicate column" errors from ADD COLUMN
            if (!e.message.includes('duplicate column')) throw e;
          }
        }
      } else {
        db.exec(sql);
      }
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(version);
    }
  }
}

function getMigrations() {
  return [
    [1, `
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

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

      CREATE TABLE IF NOT EXISTS client_interactions (
        id INTEGER PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        subject TEXT DEFAULT '',
        content TEXT DEFAULT '',
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS client_files (
        id INTEGER PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        filesize INTEGER DEFAULT 0,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

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

      CREATE TABLE IF NOT EXISTS backup_history (
        id INTEGER PRIMARY KEY,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        filesize INTEGER DEFAULT 0,
        status TEXT DEFAULT 'success',
        error_message TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
      CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices(due_date);
      CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(date);
      CREATE INDEX IF NOT EXISTS idx_time_entries_project ON time_entries(project_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
      CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date, status);
      CREATE INDEX IF NOT EXISTS idx_notes_project ON notes(project_id);
      CREATE INDEX IF NOT EXISTS idx_income_date ON income_entries(date);
    `],

    // Migration 2 — add RPM, CPM, thumbnail stats to youtube_stats
    [2, [
      `ALTER TABLE youtube_stats ADD COLUMN rpm REAL DEFAULT 0`,
      `ALTER TABLE youtube_stats ADD COLUMN cpm REAL DEFAULT 0`,
      `ALTER TABLE youtube_stats ADD COLUMN thumbnail_views INTEGER DEFAULT 0`,
      `ALTER TABLE youtube_stats ADD COLUMN ctr REAL DEFAULT 0`
    ]],

    // Migration 3 — cloud sync mapping columns (Supabase / mobile companion)
    [3, [
      `ALTER TABLE clients ADD COLUMN cloud_id TEXT`,
      `ALTER TABLE clients ADD COLUMN synced_at DATETIME`,
      `ALTER TABLE invoices ADD COLUMN cloud_id TEXT`,
      `ALTER TABLE invoices ADD COLUMN synced_at DATETIME`,
      `ALTER TABLE invoice_items ADD COLUMN cloud_id TEXT`,
      `ALTER TABLE expenses ADD COLUMN cloud_id TEXT`,
      `ALTER TABLE expenses ADD COLUMN synced_at DATETIME`,
      `ALTER TABLE expenses ADD COLUMN updated_at DATETIME`,
      `CREATE TABLE IF NOT EXISTS sync_history (
        id INTEGER PRIMARY KEY,
        direction TEXT NOT NULL,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        finished_at DATETIME,
        pushed_count INTEGER DEFAULT 0,
        pulled_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'success',
        error_message TEXT DEFAULT ''
      )`
    ]],

    // Migration 4 — cloud sync mapping for projects + time_entries (mobile companion)
    [4, [
      `ALTER TABLE projects ADD COLUMN cloud_id TEXT`,
      `ALTER TABLE projects ADD COLUMN synced_at DATETIME`,
      `ALTER TABLE time_entries ADD COLUMN cloud_id TEXT`,
      `ALTER TABLE time_entries ADD COLUMN synced_at DATETIME`,
      `ALTER TABLE time_entries ADD COLUMN updated_at DATETIME`
    ]],

    // Migration 5 — katalog produktów, kilometrówka, data sprzedaży na fakturze
    [5, [
      `ALTER TABLE invoices ADD COLUMN sale_date DATE`,
      `CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        unit TEXT DEFAULT 'usługa',
        unit_price REAL DEFAULT 0,
        btw_rate REAL DEFAULT 21,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS mileage_entries (
        id INTEGER PRIMARY KEY,
        date DATE NOT NULL,
        from_location TEXT DEFAULT '',
        to_location TEXT DEFAULT '',
        distance_km REAL NOT NULL DEFAULT 0,
        is_return INTEGER DEFAULT 0,
        purpose TEXT DEFAULT '',
        client_id INTEGER REFERENCES clients(id),
        project_id INTEGER REFERENCES projects(id),
        rate_per_km REAL DEFAULT 0.23,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS idx_mileage_date ON mileage_entries(date)`
    ]],

    // Migration 6 — multi-attachment expenses
    [6, [
      `CREATE TABLE IF NOT EXISTS expense_attachments (
        id INTEGER PRIMARY KEY,
        expense_id INTEGER REFERENCES expenses(id) ON DELETE CASCADE,
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        mime_type TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS idx_expense_attachments_expense_id ON expense_attachments(expense_id)`
    ]],

    // Migration 7 — sync kilometrówki z chmurą (kompan mobilny)
    [7, [
      `ALTER TABLE mileage_entries ADD COLUMN cloud_id TEXT`,
      `ALTER TABLE mileage_entries ADD COLUMN synced_at DATETIME`,
      `ALTER TABLE mileage_entries ADD COLUMN updated_at DATETIME`
    ]],

    // Migration 8 — nagrobki usunięć (propagacja delete do chmury i drugiego urządzenia)
    [8, [
      `CREATE TABLE IF NOT EXISTS sync_deletions (
        id INTEGER PRIMARY KEY,
        table_name TEXT NOT NULL,
        cloud_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ]]
  ];
}

function seedDefaults() {
  // Default company profile
  const profileExists = db.prepare('SELECT COUNT(*) as c FROM company_profile').get().c;
  if (!profileExists) {
    db.prepare(`
      INSERT INTO company_profile (id, name, country, invoice_prefix, invoice_next_number, default_payment_days)
      VALUES (1, '', 'Nederland', 'FV', 1, 30)
    `).run();
  }

  // Predefine Google Ireland client
  const googleExists = db.prepare("SELECT COUNT(*) as c FROM clients WHERE vat_number = 'IE6388047V'").get().c;
  if (!googleExists) {
    db.prepare(`
      INSERT INTO clients
        (name, company_name, address, city, country, vat_number, btw_rate, btw_reverse_charge, currency, status)
      VALUES
        ('Google Ireland Limited', 'Google Ireland Limited',
         'Gordon House, Barrow Street', 'Dublin 4', 'Ireland',
         'IE6388047V', 0, 1, 'EUR', 'active')
    `).run();
  }

  // Default settings
  const defaults = {
    'theme': 'dark',
    'language': 'pl',
    'density': 'comfortable',
    'pomodoro_duration': '25',
    'pomodoro_break_short': '5',
    'pomodoro_break_long': '15',
    'idle_threshold_minutes': '5',
    'auto_lock_minutes': '15',
    'sound_enabled': 'true',
    'tax_year': String(new Date().getFullYear()),
    'startersaftrek_eligible': 'false',
    'backup_auto': 'false',
    'backup_frequency': 'daily',
    'backup_time': '03:00',
    'backup_keep': '10',
    'backup_folder': '',
    'onboarding_complete': 'false',
    'pin_enabled': 'true',
    'reminders_dashboard_days': '30',
    'floating_widget_enabled': 'true'
  };

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaults)) {
    insertSetting.run(key, value);
  }

  // Seed Dutch tax deadlines for current + next year
  seedTaxDeadlines();
}

function seedTaxDeadlines() {
  const years = [new Date().getFullYear(), new Date().getFullYear() + 1];
  const insertReminder = db.prepare(`
    INSERT OR IGNORE INTO reminders (title, description, type, due_date, due_time, is_recurring, recurrence_pattern)
    VALUES (?, ?, ?, ?, '09:00', 0, '')
  `);

  for (const year of years) {
    const deadlines = [
      { title: `BTW-aangifte Q1 ${year}`, type: 'btw_aangifte', date: `${year}-04-30` },
      { title: `BTW-aangifte Q2 ${year}`, type: 'btw_aangifte', date: `${year}-07-31` },
      { title: `BTW-aangifte Q3 ${year}`, type: 'btw_aangifte', date: `${year}-10-31` },
      { title: `BTW-aangifte Q4 ${year}`, type: 'btw_aangifte', date: `${String(year + 1)}-01-31` },
      { title: `ICP-opgaaf Q1 ${year}`, type: 'icp', date: `${year}-04-30` },
      { title: `ICP-opgaaf Q2 ${year}`, type: 'icp', date: `${year}-07-31` },
      { title: `ICP-opgaaf Q3 ${year}`, type: 'icp', date: `${year}-10-31` },
      { title: `ICP-opgaaf Q4 ${year}`, type: 'icp', date: `${String(year + 1)}-01-31` },
      { title: `Aangifte Inkomstenbelasting ${year - 1}`, type: 'ib_aangifte', date: `${year}-05-01` }
    ];

    for (const d of deadlines) {
      // Only insert if not already dismissed / exists
      const existing = db.prepare('SELECT COUNT(*) as c FROM reminders WHERE title = ? AND due_date = ?').get(d.title, d.date);
      if (!existing.c) {
        insertReminder.run(d.title, `Termin złożenia deklaracji: ${d.title}`, d.type, d.date);
      }
    }
  }
}

/**
 * Factory reset — wipes all user data and re-seeds defaults.
 * Does NOT delete the database file; tables are truncated in place
 * so the schema and migrations table are preserved.
 */
function factoryReset() {
  // Order matters: children before parents (FK constraints)
  const tables = [
    'income_entries',
    'invoice_items',
    'invoices',
    'client_interactions',
    'client_files',
    'time_entries',
    'expenses',
    'tasks',
    'notes',
    'reminders',
    'adsense_imports',
    'youtube_stats',
    'backup_history',
    'projects',
    'clients',
    'settings',
    'company_profile'
  ];

  db.transaction(() => {
    db.pragma('foreign_keys = OFF');
    for (const table of tables) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
    db.pragma('foreign_keys = ON');
    seedDefaults();
  })();

  return { success: true };
}

module.exports = { init, getDb, factoryReset };
