-- CreateTable
CREATE TABLE "scheduled_jobs" (
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "next_run_at" TIMESTAMPTZ(3) NOT NULL,
    "interval_sec" INTEGER NOT NULL,
    "last_started_at" TIMESTAMPTZ(3),
    "last_ended_at" TIMESTAMPTZ(3),
    "last_status" VARCHAR(255),

    CONSTRAINT "scheduled_jobs_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "scheduled_jobs_next_run_at_idx" ON "scheduled_jobs"("next_run_at");
