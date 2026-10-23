import { get, post } from '../core/http.js';

// Backed by com.resumeanalyser.bugreport.BugReportController.

/** Sends a report (`{ whatHappened, expected, steps, page, writtenByUser }`); it waits for review. */
export function submitBugReport(report) {
  return post('/bug-reports', { json: report });
}

/** The signed-in user's reports, newest first, each with its review status. */
export function getMyBugReports() {
  return get('/bug-reports/mine');
}

/** Admin: reports with one status (PENDING, APPROVED, LINKED, REJECTED), oldest first. */
export function getBugReports(status) {
  return get(`/admin/bug-reports?status=${encodeURIComponent(status)}`);
}

/** Admin: opens a GitHub issue for the report. */
export function approveBugReport(id, title) {
  return post(`/admin/bug-reports/${encodeURIComponent(id)}/approve`, { json: { title } });
}

/** Admin: links the report to an existing GitHub issue ("42", "#42" or its link). */
export function linkBugReport(id, issue, note) {
  return post(`/admin/bug-reports/${encodeURIComponent(id)}/link`, { json: { issue, note } });
}

/** Admin: keeps the report off GitHub. */
export function rejectBugReport(id, note) {
  return post(`/admin/bug-reports/${encodeURIComponent(id)}/reject`, { json: { note } });
}
