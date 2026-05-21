CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('one_time', 'recurring')),
  recurrence_type TEXT CHECK (
    recurrence_type IS NULL OR recurrence_type IN ('daily', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly', 'custom')
  ),
  custom_interval_days INTEGER CHECK (custom_interval_days IS NULL OR custom_interval_days > 0),
  urgency TEXT NOT NULL DEFAULT 'Medium' CHECK (urgency IN ('Critical', 'High', 'Medium', 'Low')),
  assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_department TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ NOT NULL,
  next_run_at TIMESTAMPTZ,
  remind_before_minutes INTEGER NOT NULL DEFAULT 60 CHECK (remind_before_minutes > 0),
  escalate_after_minutes INTEGER NOT NULL DEFAULT 120 CHECK (escalate_after_minutes > 0),
  status TEXT NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'Acknowledged', 'Snoozed', 'Completed', 'Overdue', 'Cancelled')),
  acknowledged_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_notified_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reminders_due_at_idx ON reminders(due_at);
CREATE INDEX IF NOT EXISTS reminders_next_run_at_idx ON reminders(next_run_at);
CREATE INDEX IF NOT EXISTS reminders_status_idx ON reminders(status);
CREATE INDEX IF NOT EXISTS reminders_assigned_user_idx ON reminders(assigned_user_id);
CREATE INDEX IF NOT EXISTS reminders_assigned_department_idx ON reminders(assigned_department);
CREATE INDEX IF NOT EXISTS reminders_urgency_idx ON reminders(urgency);

CREATE TABLE IF NOT EXISTS reminder_history_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id UUID NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (
    action_type IN ('created', 'updated', 'notified', 'acknowledged', 'snoozed', 'rescheduled', 'completed', 'escalated', 'cancelled', 'auto_generated')
  ),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reminder_history_logs_reminder_idx ON reminder_history_logs(reminder_id);
CREATE INDEX IF NOT EXISTS reminder_history_logs_created_idx ON reminder_history_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS recurring_task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  instructions TEXT,
  recurrence_type TEXT NOT NULL CHECK (
    recurrence_type IN ('daily', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'custom')
  ),
  custom_interval_days INTEGER CHECK (custom_interval_days IS NULL OR custom_interval_days > 0),
  urgency TEXT NOT NULL DEFAULT 'Medium' CHECK (urgency IN ('Critical', 'High', 'Medium', 'Low')),
  assign_mode TEXT NOT NULL DEFAULT 'individual' CHECK (assign_mode IN ('individual', 'department')),
  assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_department TEXT,
  due_after_hours INTEGER NOT NULL DEFAULT 24 CHECK (due_after_hours > 0),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_generated_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recurring_task_templates_next_run_idx ON recurring_task_templates(next_run_at);
CREATE INDEX IF NOT EXISTS recurring_task_templates_active_idx ON recurring_task_templates(is_active);

CREATE TABLE IF NOT EXISTS recurring_task_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES recurring_task_templates(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL,
  generated_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  generated_for_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  run_status TEXT NOT NULL DEFAULT 'generated' CHECK (run_status IN ('generated', 'skipped', 'failed')),
  run_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(template_id, scheduled_for)
);

CREATE INDEX IF NOT EXISTS recurring_task_runs_template_idx ON recurring_task_runs(template_id);
CREATE INDEX IF NOT EXISTS recurring_task_runs_created_idx ON recurring_task_runs(created_at DESC);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS recurring_template_id UUID REFERENCES recurring_task_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recurring_run_id UUID REFERENCES recurring_task_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tasks_recurring_template_idx ON tasks(recurring_template_id);
CREATE INDEX IF NOT EXISTS tasks_recurring_run_idx ON tasks(recurring_run_id);

CREATE TABLE IF NOT EXISTS weekly_employee_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_week_start DATE NOT NULL,
  report_week_end DATE NOT NULL,
  report_status TEXT NOT NULL DEFAULT 'generated' CHECK (report_status IN ('generated', 'sent', 'failed')),
  generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  pdf_url TEXT,
  whatsapp_summary_sent_at TIMESTAMPTZ,
  email_dispatch_planned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(report_week_start, report_week_end)
);

CREATE INDEX IF NOT EXISTS weekly_employee_reports_week_idx ON weekly_employee_reports(report_week_start DESC);
