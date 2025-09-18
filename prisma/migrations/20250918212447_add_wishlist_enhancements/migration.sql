/*
  Warnings:

  - A unique constraint covering the columns `[userId,name]` on the table `Wishlist` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE `wishlist` DROP FOREIGN KEY `Wishlist_userId_fkey`;

-- DropIndex
DROP INDEX `Wishlist_userId_key` ON `wishlist`;

-- AlterTable
ALTER TABLE `wishlist` ADD COLUMN `description` TEXT NULL,
    ADD COLUMN `isDefault` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `isPublic` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `name` VARCHAR(191) NOT NULL DEFAULT 'My Wishlist',
    ADD COLUMN `notes` TEXT NULL;

-- CreateIndex
CREATE INDEX `Wishlist_userId_idx` ON `Wishlist`(`userId`);

-- CreateIndex
CREATE UNIQUE INDEX `Wishlist_userId_name_key` ON `Wishlist`(`userId`, `name`);

-- AddForeignKey
ALTER TABLE `Wishlist` ADD CONSTRAINT `Wishlist_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
