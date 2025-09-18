import { Prisma } from "@prisma/client";

interface WishlistBase {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isPublic: boolean;
  isDeleted: boolean;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  items: WishlistItemWithProduct[];

  // Add index signature for additional properties
  [key: string]:
    | string
    | number
    | boolean
    | Date
    | null
    | undefined
    | WishlistItemWithProduct[]
    | Record<string, unknown>;
}

export type WishlistWithItems = WishlistBase;

export type WishlistItemWithProduct = Prisma.WishlistItemGetPayload<{
  include: {
    product: {
      include: {
        id: true;
        name: true;
        price: true;
        images: true;
        stock: true;
        isActive: true;
        slug: true;
        rating: true;
        reviewCount: true;
        originalPrice: true;
        description: true;
        category: {
          select: {
            id: true;
            name: true;
            slug: true;
          };
        };
      };
    };
  };
}> & {
  product: {
    discount?: number;
  };
};
