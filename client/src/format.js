// SQLite datetime('now') is UTC without a zone marker; make that explicit before parsing.
export function formatDate(sqliteUtc) {
  const d = new Date(sqliteUtc.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return sqliteUtc;
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}
