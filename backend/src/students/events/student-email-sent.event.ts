export class StudentEmailSentEvent {
  constructor(
    public readonly instituteId: string,
    public readonly studentId: string,
    public readonly studentEmail: string,
    public readonly sentBy: string,
    public readonly attemptsMade: number,
  ) {}
}
