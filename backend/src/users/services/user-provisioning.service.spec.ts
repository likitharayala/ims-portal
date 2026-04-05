import {
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { UserProvisioningService } from './user-provisioning.service';

describe('UserProvisioningService', () => {
  let service: UserProvisioningService;

  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const supabaseAdmin = {
    inviteUserByEmail: jest.fn(),
    findUserByEmail: jest.fn(),
    deleteUser: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UserProvisioningService(prisma as any, supabaseAdmin as any);
  });

  it('returns an existing local user safely when idempotency is enabled for the same institute', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      instituteId: 'institute-1',
      isDeleted: false,
    });

    const result = await service.provisionInvitedUser({
      action: 'student_provision',
      email: ' Student@Example.com ',
      instituteId: 'institute-1',
      allowExistingInSameInstitute: true,
      writeLocal: jest.fn(),
    });

    expect(result).toEqual({
      status: 'existing',
      userId: 'user-1',
      payload: null,
    });
    expect(supabaseAdmin.inviteUserByEmail).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rolls back the auth user if the local transaction fails', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    supabaseAdmin.inviteUserByEmail.mockResolvedValue({
      user: { id: 'auth-user-1', email: 'student@example.com' },
      classification: 'created',
    });
    prisma.$transaction.mockRejectedValue(new Error('insert failed'));
    supabaseAdmin.deleteUser.mockResolvedValue({ success: true });

    await expect(
      service.provisionInvitedUser({
        action: 'student_provision',
        email: 'student@example.com',
        instituteId: 'institute-1',
        writeLocal: jest.fn(),
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(supabaseAdmin.inviteUserByEmail).toHaveBeenCalledWith(
      'student@example.com',
      {
        redirectTo: undefined,
        data: undefined,
      },
    );
    expect(supabaseAdmin.deleteUser).toHaveBeenCalledWith('auth-user-1');
  });

  it('does not delete pre-existing auth users when Supabase reports an existing account', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    supabaseAdmin.inviteUserByEmail.mockResolvedValue({
      user: { id: 'auth-user-9', email: 'teacher@example.com' },
      classification: 'existing',
    });

    await expect(
      service.provisionInvitedUser({
        action: 'teacher_provision',
        email: 'teacher@example.com',
        instituteId: 'institute-1',
        writeLocal: jest.fn(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(supabaseAdmin.deleteUser).not.toHaveBeenCalled();
  });

  it('throws conflict when the email already belongs to another active local user', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-2',
      instituteId: 'institute-2',
      isDeleted: false,
    });

    await expect(
      service.provisionInvitedUser({
        action: 'teacher_provision',
        email: 'teacher@example.com',
        instituteId: 'institute-1',
        writeLocal: jest.fn(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(supabaseAdmin.inviteUserByEmail).not.toHaveBeenCalled();
  });
});
