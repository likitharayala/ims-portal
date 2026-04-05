export class StudentCreatedEvent {
  constructor(
    public readonly instituteId: string,
    public readonly studentId: string,
    public readonly studentEmail: string,
    public readonly createdBy: string,
  ) {}
}
