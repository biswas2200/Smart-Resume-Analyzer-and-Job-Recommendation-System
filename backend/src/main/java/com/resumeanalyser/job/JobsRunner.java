package com.resumeanalyser.job;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import jakarta.annotation.PreDestroy;
import java.time.Clock;
import java.time.Instant;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

/**
 * Runs the long job-collection tasks one at a time in the background (a
 * full detection run asks the feeds a few thousand times), and remembers
 * how the last one went for {@code GET /admin/jobs/status}. Also owns the
 * daily refresh schedule ({@code app.jobs.refresh-cron}, India time; "-" turns it off).
 */
@Component
public class JobsRunner {

    private static final Logger log = LoggerFactory.getLogger(JobsRunner.class);

    private final CompanyService companyService;
    private final JobRefreshService refreshService;
    private final JobSkillService skillService;
    private final Clock clock;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "jobs-runner");
        thread.setDaemon(true);
        return thread;
    });
    private final AtomicReference<Run> current = new AtomicReference<>();

    public JobsRunner(CompanyService companyService, JobRefreshService refreshService, JobSkillService skillService,
                      Clock clock) {
        this.companyService = companyService;
        this.refreshService = refreshService;
        this.skillService = skillService;
        this.clock = clock;
    }

    /**
     * @param task     "discover", "import-startup-map", "detect" or "refresh"
     * @param state    RUNNING, DONE or FAILED
     * @param summary  what the run did (or why it failed); empty while running
     */
    public record Run(String task, String state, Instant startedAt, Instant finishedAt, String summary) {}

    /** Seeds from Wikidata, then looks for every new company's job feed. */
    public boolean startDiscover() {
        return start("discover", () -> companyService.seedFromWikidata() + "; " + companyService.detectPending());
    }

    /** Adds the Bangalore Startup Map's companies and reads the jobs their Apply links point at. */
    public boolean startImportStartupMap() {
        return start("import-startup-map", () -> companyService.importStartupMap().toString());
    }

    /** Retries detection for companies still PENDING (e.g. after a network failure). */
    public boolean startDetect() {
        return start("detect", () -> companyService.detectPending().toString());
    }

    public boolean startRefresh() {
        return start("refresh", () -> refreshService.refreshAll().toString());
    }

    @Scheduled(cron = "${app.jobs.refresh-cron}", zone = "Asia/Kolkata")
    void dailyRefresh() {
        if (!startRefresh()) {
            log.info("Daily job refresh skipped: another job task is still running");
        }
    }

    /** The task running now, or the last one to finish; null if none has run since start-up. */
    public Run status() {
        return current.get();
    }

    /** False (and nothing starts) if a task is already running. */
    private synchronized boolean start(String task, Supplier<String> work) {
        Run running = current.get();
        if (running != null && running.finishedAt() == null) {
            return false;
        }
        Instant startedAt = clock.instant();
        current.set(new Run(task, "RUNNING", startedAt, null, ""));
        executor.submit(() -> {
            try {
                // Every task ends by reading the skills of any new or changed posting.
                String summary = work.get() + "; " + skillService.extractMissing();
                current.set(new Run(task, "DONE", startedAt, clock.instant(), summary));
            } catch (RuntimeException e) {
                log.error("Job task {} failed", task, e);
                current.set(new Run(task, "FAILED", startedAt, clock.instant(), e.getMessage()));
            }
        });
        return true;
    }

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }
}
