-- AlterTable
ALTER TABLE `order` ADD COLUMN `carrier` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `wishlistitem` MODIFY `rating` INTEGER NULL DEFAULT NULL;
