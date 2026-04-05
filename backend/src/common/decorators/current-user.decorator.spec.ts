import { normalizeCurrentUser } from './current-user.decorator';

describe('normalizeCurrentUser', () => {
  it('preserves the current legacy payload shape and fills normalized defaults', () => {
    expect(
      normalizeCurrentUser({
        sub: 'user-1',
        institute_id: 'institute-1',
        role: 'admin',
        session_id: 'session-1',
      }),
    ).toEqual({
      sub: 'user-1',
      email: '',
      institute_id: 'institute-1',
      role: 'admin',
      auth_provider: 'custom',
      session_id: 'session-1',
    });
  });

  it('maps legacy userId to sub safely', () => {
    expect(
      normalizeCurrentUser({
        userId: 'legacy-user-1',
        institute_id: 'institute-1',
        role: 'student',
        session_id: 'session-1',
      }),
    ).toEqual({
      userId: 'legacy-user-1',
      sub: 'legacy-user-1',
      email: '',
      institute_id: 'institute-1',
      role: 'student',
      auth_provider: 'custom',
      session_id: 'session-1',
    });
  });
});
