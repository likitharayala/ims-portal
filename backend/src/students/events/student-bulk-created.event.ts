export class StudentBulkCreatedEvent {
  constructor(
    public readonly instituteId: string,
    public readonly createdBy: string,
    public readonly createdCount: number,
    public readonly skippedCount: number,
    public readonly queuedForEmailCount: number,
    public readonly emailQueueFailureCount: number,
  ) {}
}
