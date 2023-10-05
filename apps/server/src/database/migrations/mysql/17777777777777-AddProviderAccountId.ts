import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddProviderAccountId17777777777777 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`chat_flow\` ADD COLUMN IF NOT EXISTS \`providerAccountId\`  TEXT NOT NULL;`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`chat_flow\` DROP COLUMN \`providerAccountId\`;`)
    }
}
