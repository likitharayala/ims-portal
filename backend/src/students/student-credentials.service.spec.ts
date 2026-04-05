import * as bcrypt from 'bcrypt';
import { StudentCredentialsService } from './student-credentials.service';

describe('StudentCredentialsService', () => {
  let service: StudentCredentialsService;

  beforeEach(() => {
    service = new StudentCredentialsService();
  });

  it('generates an eight-character temporary password from the supported character set', () => {
    const password = service.generateTemporaryPassword();

    expect(password).toHaveLength(8);
    expect(password).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789]{8}$/);
  });

  it('hashes passwords using bcrypt', async () => {
    const password = 'StudentPass123';
    const hash = await service.hashPassword(password);

    expect(hash).not.toBe(password);
    await expect(bcrypt.compare(password, hash)).resolves.toBe(true);
  });

  it('creates a locked password hash that is not a raw UUID', async () => {
    const hash = await service.createLockedPasswordHash();

    expect(hash).toEqual(expect.any(String));
    expect(hash.startsWith('$2')).toBe(true);
  });
});
