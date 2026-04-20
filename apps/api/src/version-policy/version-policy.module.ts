import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VersionPolicy, VersionPolicySchema } from './schemas/version-policy.schema';
import { VersionPolicyAdminController } from './version-policy.admin.controller';
import { VersionPolicyRepository } from './version-policy.repository';
import { VersionPolicyService } from './version-policy.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: VersionPolicy.name, schema: VersionPolicySchema }])],
  controllers: [VersionPolicyAdminController],
  providers: [VersionPolicyRepository, VersionPolicyService],
  exports: [VersionPolicyService],
})
export class VersionPolicyModule {}
