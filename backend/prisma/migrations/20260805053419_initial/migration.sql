-- CreateEnum
CREATE TYPE "roles" AS ENUM ('ADMIN', 'MEMBER');

-- CreateTable
CREATE TABLE "login_sessions" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "session_id" VARCHAR(255) NOT NULL,
    "device_id" VARCHAR(255) NOT NULL,
    "login_ip" VARCHAR(255) NOT NULL,
    "user_agent" VARCHAR(255) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "last_active_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "tenant_name" VARCHAR(255) NOT NULL,
    "tenant_code" VARCHAR(255) NOT NULL,
    "source_ip_range" VARCHAR(255) NOT NULL DEFAULT '0.0.0.0/0',
    "configurations" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "user_name" VARCHAR(255) NOT NULL,
    "role" "roles" NOT NULL,
    "is_disabled" BOOLEAN NOT NULL DEFAULT false,
    "login_id" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_changed_at" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edit_locks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "lock_name" VARCHAR(255) NOT NULL,
    "locked_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "edit_locks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "user_id" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL,
    "last_sent_at" TIMESTAMPTZ(3) NOT NULL,
    "auth_code" VARCHAR(6) NOT NULL,
    "fail_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "password_reset_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "date_examples" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "date" DATE NOT NULL,

    CONSTRAINT "date_examples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debug_parameters" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "value" VARCHAR(255) NOT NULL,

    CONSTRAINT "debug_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "login_sessions_session_id_key" ON "login_sessions"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "login_sessions_device_id_key" ON "login_sessions"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_tenant_name_key" ON "tenants"("tenant_name");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_tenant_code_key" ON "tenants"("tenant_code");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_login_id_key" ON "users"("tenant_id", "login_id");

-- CreateIndex
CREATE UNIQUE INDEX "edit_locks_tenant_id_lock_name_key" ON "edit_locks"("tenant_id", "lock_name");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_requests_tenant_id_user_id_key" ON "password_reset_requests"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "date_examples_tenant_id_date_key" ON "date_examples"("tenant_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "debug_parameters_tenant_id_name_key" ON "debug_parameters"("tenant_id", "name");

-- AddForeignKey
ALTER TABLE "login_sessions" ADD CONSTRAINT "login_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "login_sessions" ADD CONSTRAINT "login_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "edit_locks" ADD CONSTRAINT "edit_locks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "date_examples" ADD CONSTRAINT "date_examples_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "debug_parameters" ADD CONSTRAINT "debug_parameters_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
