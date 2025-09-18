/*
  Warnings:

  - Added the required column `updatedAt` to the `WishlistItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `wishlistitem` ADD COLUMN `notes` TEXT NULL,
    ADD COLUMN `rating` INTEGER NULL DEFAULT NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL;
