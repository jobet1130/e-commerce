-- AlterTable
ALTER TABLE `payment` ADD COLUMN `reference` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `wishlistitem` MODIFY `rating` INTEGER NULL DEFAULT NULL;
