-- CreateEnum
CREATE TYPE "QuestionTypePreference" AS ENUM ('mcq', 'descriptive', 'both');

-- CreateEnum
CREATE TYPE "DifficultyLevel" AS ENUM ('easy', 'medium', 'hard');

-- AlterTable
ALTER TABLE "assessment_questions" ADD COLUMN     "difficulty_level" "DifficultyLevel";

-- AlterTable
ALTER TABLE "assessments" ADD COLUMN     "difficulty_distribution" JSONB,
ADD COLUMN     "question_type_preference" "QuestionTypePreference";
