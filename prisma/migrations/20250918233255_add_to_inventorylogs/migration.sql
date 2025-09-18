/*
  Warnings:

  - Added the required column `updatedAt` to the `InventoryLog` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `inventorylog` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL;

-- AlterTable
ALTER TABLE `wishlistitem` MODIFY `rating` INTEGER NULL DEFAULT NULL;
