export class StudentEmailQueuedEvent {
  constructor(
    public readonly instituteId: string,
    public readonly studentId: string,
    public readonly studentEmail: string,
    public readonly queuedBy: string,
  ) {}
}
