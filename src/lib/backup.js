// Backup reminder rule. Pure: no DOM or browser globals.

export const REMINDER_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

/**
 * Status for the Backup screen banner.
 * @param {{lastBackupAt?: number, backupReminder: boolean}} settings
 * @param {number} sessionCount  sessions stored on this device
 * @param {number} now           epoch ms
 * @returns {{overdue: boolean, title: string, sub: string}}
 */
export function backupStatus(settings, sessionCount, now) {
  const last = settings.lastBackupAt;
  const days = last ? Math.floor((now - last) / DAY) : null;
  const sub = last ? `Last export ${agoText(days)}` : 'No backup exported yet';
  if (!sessionCount) return { overdue: false, title: 'Nothing to back up yet', sub };
  if (!settings.backupReminder) return { overdue: false, title: 'Reminder off', sub };
  const overdue = days === null || days >= REMINDER_DAYS;
  return { overdue, title: overdue ? 'Backup overdue' : 'Backed up', sub };
}

function agoText(days) {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}
