-- Split from a single combined migration (M6): Postgres refuses to use a
-- newly added enum value in the same transaction that adds it
-- ("unsafe use of new value ... New enum values must be committed before
-- they can be used") — so the enum-value additions have to land in their
-- own migration, committed, before the next migration can use them as a
-- column DEFAULT. See docs/development-plan/README.md §M6.

-- CreateEnum
CREATE TYPE "AIAnalysisStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- AlterEnum
ALTER TYPE "EmailDraftStatus" ADD VALUE 'PENDING';
ALTER TYPE "EmailDraftStatus" ADD VALUE 'FAILED';
