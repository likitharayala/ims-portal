import { Module } from '@nestjs/common';
import { SupabaseModule } from '../integrations/supabase/supabase.module';
import { UserAuthMigrationService } from './services/user-auth-migration.service';
import { UserProvisioningService } from './services/user-provisioning.service';

@Module({
  imports: [SupabaseModule],
  providers: [UserProvisioningService, UserAuthMigrationService],
  exports: [UserProvisioningService, UserAuthMigrationService],
})
export class UsersModule {}
