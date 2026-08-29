-- Second half of the M6 AI-status migration (see
-- 20260829010000_add_ai_status_enum_values for why this had to be split).

-- AlterTable
ALTER TABLE "AIAnalysis" ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "status" "AIAnalysisStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "EmailDraft" ADD COLUMN     "errorMessage" TEXT,
ALTER COLUMN "subject" DROP NOT NULL,
ALTER COLUMN "body" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'PENDING';
