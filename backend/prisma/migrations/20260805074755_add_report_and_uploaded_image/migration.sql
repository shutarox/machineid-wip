-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "comment" TEXT NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploaded_images" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "user_id" UUID NOT NULL,
    "report_id" UUID,
    "storage_key" VARCHAR(255) NOT NULL,
    "thumbnail_key" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(255) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "raw_exif" JSONB NOT NULL,

    CONSTRAINT "uploaded_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_tenant_id_user_id_created_at_idx" ON "reports"("tenant_id", "user_id", "created_at");

-- CreateIndex
CREATE INDEX "reports_tenant_id_created_at_idx" ON "reports"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "uploaded_images_tenant_id_report_id_idx" ON "uploaded_images"("tenant_id", "report_id");

-- CreateIndex
CREATE INDEX "uploaded_images_tenant_id_created_at_idx" ON "uploaded_images"("tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "uploaded_images" ADD CONSTRAINT "uploaded_images_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "uploaded_images" ADD CONSTRAINT "uploaded_images_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "uploaded_images" ADD CONSTRAINT "uploaded_images_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
