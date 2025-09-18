-- AlterTable
ALTER TABLE `order` ADD COLUMN `couponId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `wishlistitem` MODIFY `rating` INTEGER NULL DEFAULT NULL;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_couponId_fkey` FOREIGN KEY (`couponId`) REFERENCES `Coupon`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
