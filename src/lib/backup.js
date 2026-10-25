// Backup reminder rule and the change check for automatic backup. Pure: no DOM or browser globals.

export const REMINDER_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

/**
 * Status for the Backup screen banner.
 * @param {{lastBackupAt?: number, backupReminder: boolean}} settings
 * @param {number} sessionCount  sessions stored on this device
 * @param {number} now           epoch ms
 * @param {number} [cloudAt]     last automatic backup, epoch ms
 * @returns {{overdue: boolean, title: string, sub: string}}
 */
export function backupStatus(settings, sessionCount, now, cloudAt) {
  const auto = Number.isFinite(cloudAt) && cloudAt >= (settings.lastBackupAt || 0);
  const last = auto ? cloudAt : settings.lastBackupAt;
  const days = last ? Math.floor((now - last) / DAY) : null;
  const sub = last ? `Last ${auto ? 'automatic backup' : 'export'} ${agoText(days)}` : 'No backup yet';
  if (!sessionCount) return { overdue: false, title: 'Nothing to back up yet', sub };
  if (!settings.backupReminder) return { overdue: false, title: 'Reminder off', sub };
  const overdue = days === null || days >= REMINDER_DAYS;
  return { overdue, title: overdue ? 'Backup overdue' : 'Backed up', sub };
}

/**
 * The parts of a backup that matter for "has anything changed since the last upload?":
 * everything except the export time and the export bookkeeping in settings.
 */
export function backupFingerprint(backup) {
  const { exportedAt, settings, ...rest } = backup;
  const { lastBackupAt, ...keptSettings } = settings || {};
  return JSON.stringify({ ...rest, settings: keptSettings });
}

function agoText(days) {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}
