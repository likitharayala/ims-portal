import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFiles,
  UploadedFile,
  Res,
} from '@nestjs/common';
import { FilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/decorators/roles.decorator';
import { RequiresFeature } from '../common/decorators/feature.decorator';
import { Feature } from '../common/decorators/feature.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AssessmentsService } from './assessments.service';
import { SubmissionsService } from './submissions.service';
import { EvaluationService } from './evaluation.service';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { UpdateAssessmentDto } from './dto/update-assessment.dto';
import { ListAssessmentsQueryDto } from './dto/list-assessments-query.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { GenerateQuestionsDto } from '../ai/dto/generate-questions.dto';
import { SaveAnswersDto } from './dto/save-answers.dto';
import { EnterMarksDto } from './dto/enter-marks.dto';
import { GrantExtraTimeDto } from './dto/grant-extra-time.dto';
import * as fs from 'fs';
import type { Response } from 'express';
import type { JwtPayload } from '../common/decorators/current-user.decorator';

@Controller()
@RequiresFeature(Feature.Assessments)
export class AssessmentsController {
  constructor(
    private readonly assessmentsService: AssessmentsService,
    private readonly submissionsService: SubmissionsService,
    private readonly evaluationService: EvaluationService,
  ) {}

  // ════════════════════════════════════════
  //  ADMIN — Assessments CRUD
  // ════════════════════════════════════════

  @Get('admin/assessments')
  @Roles(Role.Admin)
  listAdmin(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListAssessmentsQueryDto,
  ) {
    return this.assessmentsService.listAssessmentsAdmin(
      user.institute_id,
      query,
    );
  }

  @Post('admin/assessments')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAssessmentDto,
  ) {
    return this.assessmentsService.createAssessment(
      user.institute_id,
      user.sub,
      dto,
    );
  }

  @Get('admin/assessments/:id')
  @Roles(Role.Admin)
  getOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.assessmentsService.getAssessment(user.institute_id, id, true);
  }

  @Patch('admin/assessments/:id')
  @Roles(Role.Admin)
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateAssessmentDto,
  ) {
    return this.assessmentsService.updateAssessment(
      user.institute_id,
      user.sub,
      id,
      dto,
    );
  }

  @Post('admin/assessments/:id/publish')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.OK)
  publish(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.assessmentsService.publishAssessment(
      user.institute_id,
      user.sub,
      id,
    );
  }

  @Delete('admin/assessments/:id')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.assessmentsService.deleteAssessment(
      user.institute_id,
      user.sub,
      id,
    );
  }

  @Post('admin/assessments/:id/duplicate')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.CREATED)
  duplicate(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.assessmentsService.duplicateAssessment(
      user.institute_id,
      user.sub,
      id,
    );
  }

  // ════════════════════════════════════════
  //  ADMIN — Questions
  // ════════════════════════════════════════

  @Get('admin/assessments/:id/questions')
  @Roles(Role.Admin)
  getQuestions(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.assessmentsService.getQuestions(user.institute_id, id);
  }

  @Post('admin/assessments/:id/questions')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.CREATED)
  addQuestion(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.assessmentsService.addQuestion(user.institute_id, id, dto);
  }

  @Patch('admin/assessments/:id/questions/:qid')
  @Roles(Role.Admin)
  updateQuestion(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('qid') qid: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.assessmentsService.updateQuestion(
      user.institute_id,
      id,
      qid,
      dto,
    );
  }

  @Delete('admin/assessments/:id/questions/:qid')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteQuestion(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('qid') qid: string,
  ) {
    return this.assessmentsService.deleteQuestion(user.institute_id, id, qid);
  }

  @Post('admin/assessments/:id/generate-questions')
  @Roles(Role.Admin)
  generateQuestions(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: GenerateQuestionsDto,
  ) {
    return this.assessmentsService.generateQuestions(user.institute_id, id, dto);
  }

  // ════════════════════════════════════════
  //  ADMIN — Evaluation
  // ════════════════════════════════════════

  @Get('admin/assessments/:id/submissions')
  @Roles(Role.Admin)
  listSubmissions(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.evaluationService.listSubmissions(user.institute_id, id);
  }

  @Get('admin/assessments/:id/submissions/:sid')
  @Roles(Role.Admin)
  getSubmission(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('sid') sid: string,
  ) {
    return this.evaluationService.getSubmission(user.institute_id, id, sid);
  }

  @Patch('admin/assessments/:id/submissions/:sid/marks')
  @Roles(Role.Admin)
  enterMarks(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('sid') sid: string,
    @Body() dto: EnterMarksDto,
  ) {
    return this.evaluationService.enterMarks(
      user.institute_id,
      user.sub,
      id,
      sid,
      dto,
    );
  }

  @Post('admin/assessments/:id/submissions/:sid/finalize')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.OK)
  finalize(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('sid') sid: string,
  ) {
    return this.evaluationService.finalizeSubmission(
      user.institute_id,
      user.sub,
      id,
      sid,
    );
  }

  @Post('admin/assessments/:id/submissions/:sid/release')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.OK)
  releaseOne(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('sid') sid: string,
  ) {
    return this.evaluationService.releaseResult(user.institute_id, id, sid);
  }

  @Post('admin/assessments/:id/release-results')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.OK)
  releaseAll(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.evaluationService.releaseAllResults(
      user.institute_id,
      user.sub,
      id,
    );
  }

  @Post('admin/assessments/:id/mark-evaluated')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.OK)
  markEvaluated(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.evaluationService.markAssessmentEvaluated(
      user.institute_id,
      user.sub,
      id,
    );
  }

  @Get('admin/assessments/:id/stats')
  @Roles(Role.Admin)
  getStats(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.evaluationService.getStats(user.institute_id, id);
  }

  // ─── Extra Time ───────────────────────────────────────────────────────

  @Post('admin/assessments/:id/extra-time')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.OK)
  grantExtraTime(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: GrantExtraTimeDto,
  ) {
    return this.assessmentsService.grantExtraTime(
      user.institute_id,
      user.sub,
      id,
      dto,
    );
  }

  @Get('admin/assessments/:id/extra-time')
  @Roles(Role.Admin)
  listExtraTime(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.assessmentsService.listExtraTime(user.institute_id, id);
  }

  @Delete('admin/assessments/:id/extra-time/:studentId')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeExtraTime(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('studentId') studentId: string,
  ) {
    return this.assessmentsService.removeExtraTime(
      user.institute_id,
      user.sub,
      id,
      studentId,
    );
  }

  // ════════════════════════════════════════
  //  STUDENT — Assessments
  // ════════════════════════════════════════

  @Get('student/assessments')
  @Roles(Role.Student)
  listStudent(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListAssessmentsQueryDto,
  ) {
    return this.assessmentsService.listAssessmentsStudent(
      user.institute_id,
      query,
    );
  }

  @Get('student/assessments/:id')
  @Roles(Role.Student)
  getStudentAssessment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.assessmentsService.getAssessment(user.institute_id, id, true);
  }

  // ─── Submission endpoints ─────────────────────────────────────────────

  @Post('student/assessments/:id/start')
  @Roles(Role.Student)
  @HttpCode(HttpStatus.CREATED)
  startExam(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.submissionsService.startExam(
      user.institute_id,
      user.sub,
      id,
    );
  }

  @Put('student/assessments/:id/save')
  @Roles(Role.Student)
  @HttpCode(HttpStatus.OK)
  saveAnswers(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SaveAnswersDto,
  ) {
    return this.submissionsService.saveAnswers(
      user.institute_id,
      user.sub,
      id,
      dto,
    );
  }

  @Post('student/assessments/:id/submit')
  @Roles(Role.Student)
  @HttpCode(HttpStatus.OK)
  submitExam(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SaveAnswersDto,
  ) {
    return this.submissionsService.submitExam(
      user.institute_id,
      user.sub,
      id,
      dto,
    );
  }

  @Post('student/assessments/:id/upload')
  @Roles(Role.Student)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @HttpCode(HttpStatus.CREATED)
  uploadAnswerSheet(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.submissionsService.uploadAnswerSheet(
      user.institute_id,
      user.sub,
      id,
      file,
    );
  }

  @Get('student/assessments/:id/submission')
  @Roles(Role.Student)
  getMySubmission(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.submissionsService.getMySubmission(
      user.institute_id,
      user.sub,
      id,
    );
  }

  @Get('student/assessments/:id/extra-time')
  @Roles(Role.Student)
  getMyExtraTime(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.assessmentsService.getStudentExtraTime(
      user.institute_id,
      user.sub,
      id,
    );
  }

  @Get('student/assessments/:id/result')
  @Roles(Role.Student)
  getResult(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.evaluationService.getStudentResult(
      user.institute_id,
      user.sub,
      id,
    );
  }

  // ─── Student: released results ─────────────────────────────────────────
  @Get('student/results')
  @Roles(Role.Student)
  getMyResults(@CurrentUser() user: JwtPayload) {
    return this.evaluationService.getStudentResults(
      user.institute_id,
      user.sub,
    );
  }

  // ─── Student: own performance history ─────────────────────────────────
  @Get('student/performance')
  @Roles(Role.Student)
  getMyPerformance(@CurrentUser() user: JwtPayload) {
    return this.evaluationService.getMyPerformanceHistory(
      user.institute_id,
      user.sub,
    );
  }

  // ─── Admin: student performance history ───────────────────────────────
  @Get('admin/students/:id/performance')
  @Roles(Role.Admin)
  @RequiresFeature(Feature.Students)
  getStudentPerformance(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.evaluationService.getStudentPerformanceHistory(
      user.institute_id,
      id,
    );
  }

  // ─── Serve submission file ─────────────────────────────────────────────
  @Get('submissions/file')
  @HttpCode(HttpStatus.OK)
  async serveFile(
    @CurrentUser() user: JwtPayload,
    @Query('path') filePath: string,
    @Res() res: Response,
  ) {
    const abs = this.evaluationService.getFilePath(
      user.institute_id,
      filePath,
    );
    (res as any).setHeader('Content-Type', 'application/pdf');
    (res as any).setHeader('Content-Disposition', 'inline');
    const stream = fs.createReadStream(abs);
    stream.pipe(res as any);
  }
}
