-- AlterTable
ALTER TABLE `wishlist` ADD COLUMN `rating` DOUBLE NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `wishlistitem` MODIFY `rating` INTEGER NULL DEFAULT NULL;
