-- CreateTable
CREATE TABLE "assessment_extra_time" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assessment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "extra_minutes" INTEGER NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "assessment_extra_time_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assessment_extra_time_assessment_id_idx" ON "assessment_extra_time"("assessment_id");

-- CreateIndex
CREATE INDEX "assessment_extra_time_institute_id_idx" ON "assessment_extra_time"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_extra_time_assessment_id_student_id_key" ON "assessment_extra_time"("assessment_id", "student_id");

-- AddForeignKey
ALTER TABLE "assessment_extra_time" ADD CONSTRAINT "assessment_extra_time_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_extra_time" ADD CONSTRAINT "assessment_extra_time_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
