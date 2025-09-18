/*
  Warnings:

  - You are about to drop the column `billingAddress` on the `order` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `order` DROP COLUMN `billingAddress`,
    ADD COLUMN `billingAddressId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `wishlistitem` MODIFY `rating` INTEGER NULL DEFAULT NULL;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_billingAddressId_fkey` FOREIGN KEY (`billingAddressId`) REFERENCES `Address`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
