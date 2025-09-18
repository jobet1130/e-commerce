import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { WishlistWithItems } from "@/types/wishlist";

import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  serverErrorResponse,
  badRequestResponse,
} from "@/lib/api/api-response";

// Constants
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

// Validation schemas
const wishlistItemSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
});

const bulkWishlistItemsSchema = z.object({
  productIds: z
    .array(z.string().min(1, "Product ID cannot be empty"))
    .min(1, "At least one product ID is required"),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE)
    .optional(),
  sortBy: z
    .enum(["newest", "price-asc", "price-desc", "name-asc", "name-desc"])
    .default("newest")
    .optional(),
});

// GET /api/wishlist - Get user's wishlist
// POST /api/wishlist - Add product to wishlist
// DELETE /api/wishlist - Remove product from wishlist

// Helper function to get sort options
const getSortOptions = (
  sortBy: string,
): Prisma.WishlistItemOrderByWithRelationInput => {
  switch (sortBy) {
    case "price-asc":
      return { product: { price: "asc" } };
    case "price-desc":
      return { product: { price: "desc" } };
    case "name-asc":
      return { product: { name: "asc" } };
    case "name-desc":
      return { product: { name: "desc" } };
    case "newest":
    default:
      return { addedAt: "desc" };
  }
};

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return unauthorizedResponse(
        "You must be logged in to view your wishlist",
      );
    }

    // Parse and validate query parameters
    const searchParams = request.nextUrl.searchParams;
    const queryParams = paginationSchema.safeParse({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      sortBy: searchParams.get("sortBy"),
    });

    if (!queryParams.success) {
      return badRequestResponse(
        "Invalid query parameters",
        queryParams.error.format(),
      );
    }

    // At this point, we know the validation succeeded, so data is defined
    const validatedData = queryParams.data;
    const page = validatedData.page ?? 1; // Use nullish coalescing to ensure number
    const pageSize = validatedData.pageSize ?? DEFAULT_PAGE_SIZE; // Use the same default as in schema
    const sortBy = validatedData.sortBy ?? "newest"; // Use the same default as in schema
    const skip = (page - 1) * pageSize;
    const sortOptions = getSortOptions(sortBy);

    // Get user's wishlist with paginated items
    const [wishlist, totalItems] = await Promise.all([
      prisma.wishlist.findFirst({
        where: {
          userId: session.user.id,
          isDeleted: false,
        },
        include: {
          items: {
            include: {
              product: {
                include: {
                  category: {
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                    },
                  },
                },
              },
            },
            orderBy: sortOptions,
            skip,
            take: pageSize,
          },
        },
      }) as Promise<WishlistWithItems | null>,
      prisma.wishlistItem.count({
        where: { wishlist: { userId: session.user.id } },
      }),
    ]);

    if (!wishlist) {
      // Create an empty wishlist if it doesn't exist
      const newWishlist = await prisma.wishlist.create({
        data: {
          user: { connect: { id: session.user.id } },
        },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  price: true,
                  originalPrice: true,
                  images: true,
                  stock: true,
                  isActive: true,
                  slug: true,
                  reviewCount: true,
                  rating: true,
                  category: {
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                    },
                  },
                } as Prisma.ProductSelect,
              },
            },
          },
        },
      });

      return successResponse({
        data: {
          ...newWishlist,
          pagination: {
            totalItems: 0,
            totalPages: 0,
            currentPage: 1,
            pageSize,
            hasNextPage: false,
          },
        },
      });
    }

    const totalPages = Math.ceil(totalItems / pageSize);
    const hasNextPage = page < totalPages;

    if (!wishlist) {
      return successResponse({
        data: {
          id: "",
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: session.user.id,
          items: [],
          pagination: {
            totalItems: 0,
            totalPages: 0,
            currentPage: page,
            pageSize,
            hasNextPage: false,
          },
        },
      });
    }

    // Calculate discount for each product and create a new array with the proper type
    const itemsWithDiscount = wishlist.items.map((item) => {
      const product = item.product;
      const discount =
        product.originalPrice > 0 && product.originalPrice > product.price
          ? Math.round(
              ((product.originalPrice - product.price) /
                product.originalPrice) *
                100,
            )
          : 0;

      return {
        ...item,
        product: {
          ...product,
          discount,
        },
      };
    });

    return successResponse({
      data: {
        ...wishlist,
        items: itemsWithDiscount,
        pagination: {
          totalItems,
          totalPages,
          currentPage: page,
          pageSize,
          hasNextPage,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching wishlist:", error);
    return serverErrorResponse("Failed to fetch wishlist");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return unauthorizedResponse("You must be logged in to add to wishlist");
    }

    // Validate request body
    const body = await request.json();
    const validation = wishlistItemSchema.safeParse(body);

    if (!validation.success) {
      return badRequestResponse("Validation error", validation.error.format());
    }

    const { productId } = validation.data;

    // Get or create user's wishlist
    const wishlist = (await prisma.wishlist.findFirst({
      where: {
        userId: session.user.id,
        isDeleted: false,
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    })) as WishlistWithItems | null;

    // Check if product exists and is active
    const product = await prisma.product.findUnique({
      where: { id: productId, isActive: true },
    });

    if (!product) {
      return errorResponse("Product not found or unavailable", 404);
    }

    // Check if wishlist exists
    if (!wishlist) {
      return errorResponse("Wishlist not found", 404);
    }

    // Check if product is already in wishlist
    const existingItem = wishlist.items.find(
      (item) => item.productId === productId,
    );

    if (existingItem) {
      return successResponse({
        data: wishlist,
        message: "Product is already in your wishlist",
      });
    }

    // Add product to wishlist
    const updatedWishlist = (await prisma.wishlist.update({
      where: { id: wishlist.id },
      data: {
        items: {
          create: {
            product: { connect: { id: productId } },
          },
        },
      },
      select: {
        id: true,
        name: true,
        description: true,
        isDefault: true,
        isPublic: true,
        isDeleted: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
        items: {
          select: {
            id: true,
            wishlist: {
              select: {
                id: true,
              },
            },
            product: {
              select: {
                id: true,
                name: true,
                price: true,
                images: true,
                stock: true,
                isActive: true,
                slug: true,
                description: true,
                rating: true,
                reviewCount: true,
                originalPrice: true,
                sku: true,
                barcode: true,
                weight: true,
                dimensions: true,
                expiryDate: true,
                isFeatured: true,
                tags: true,
                metaTitle: true,
                metaDescription: true,
                categoryId: true,
                brandId: true,
                supplierId: true,
                createdAt: true,
                updatedAt: true,
                category: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                  },
                },
              },
            },
          },
        },
      },
    })) as unknown as WishlistWithItems;

    return successResponse({
      data: updatedWishlist,
      message: "Product added to wishlist successfully",
    });
  } catch (error) {
    console.error("Error adding to wishlist:", error);
    return serverErrorResponse("Failed to add product to wishlist");
  }
}

// Type for the updated wishlist item response
type UpdatedWishlistItemResponse = {
  id: string;
  wishlist: {
    id: string;
  };
  product: {
    id: string;
    name: string;
    slug: string;
    price: number;
    images: Prisma.JsonValue;
  };
  rating: number | null;
  notes: string | null;
  addedAt: Date;
};

// Rate a wishlist item
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return unauthorizedResponse("You must be logged in to rate items");
    }

    // Validate request body
    const body = await request.json();
    const validation = z
      .object({
        itemId: z.string().min(1, "Wishlist item ID is required"),
        rating: z.number().int().min(1).max(5).nullable(),
        notes: z.string().optional(),
      })
      .safeParse(body);

    if (!validation.success) {
      const formattedErrors = validation.error.format();
      return badRequestResponse("Invalid request data", formattedErrors);
    }

    const { itemId, rating, notes } = validation.data;

    // Update the wishlist item with the new rating
    const updatedItem = (await prisma.wishlistItem.update({
      where: {
        id: itemId,
        wishlist: {
          userId: session.user.id,
        },
      },
      data: {
        rating,
        ...(notes !== undefined && { notes }),
      },
      select: {
        id: true,
        productId: true,
        rating: true,
        notes: true,
        addedAt: true,
        updatedAt: true,
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            price: true,
            images: true,
          },
        },
        wishlist: {
          select: {
            id: true,
          },
        },
      },
    })) as unknown as UpdatedWishlistItemResponse;

    return successResponse({
      data: updatedItem,
      message: rating
        ? "Rating updated successfully"
        : "Rating removed successfully",
    });
  } catch (error) {
    console.error("Error updating rating:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return badRequestResponse(
          "Wishlist item not found or you don't have permission",
        );
      }
    }
    return serverErrorResponse("Failed to update rating");
  }
}

// Add multiple items to wishlist
export async function handleAddMultipleItems(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return unauthorizedResponse(
        "You must be logged in to update your wishlist",
      );
    }

    // Validate request body
    const body = await request.json();
    const validation = bulkWishlistItemsSchema.safeParse(body);

    if (!validation.success) {
      return badRequestResponse("Validation error", validation.error.format());
    }

    const { productIds } = validation.data;

    // Check if products exist and are active
    const existingProducts = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        isActive: true,
      },
      select: { id: true },
    });

    if (existingProducts.length === 0) {
      return errorResponse("No valid products found to add", 404);
    }

    const existingProductIds = existingProducts.map((p) => p.id);
    const invalidProductIds = productIds.filter(
      (id) => !existingProductIds.includes(id),
    );

    // Get or create user's wishlist
    let wishlist: WishlistWithItems | null = null;

    // First, try to find an existing wishlist
    const existingWishlist = await prisma.wishlist.findFirst({
      where: {
        userId: session.user.id,
        isDeleted: false,
      },
      include: {
        items: {
          include: {
            product: {
              include: {
                category: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (existingWishlist) {
      wishlist = {
        ...existingWishlist,
        items: existingWishlist.items || [],
      } as WishlistWithItems;
    } else {
      const newWishlist = await prisma.wishlist.create({
        data: {
          user: { connect: { id: session.user.id } },
          name: "My Wishlist",
          description: null,
          isDefault: true,
          isPublic: false,
          isDeleted: false,
          notes: null,
        },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  price: true,
                  images: true,
                  stock: true,
                  isActive: true,
                  slug: true,
                  rating: true,
                  reviewCount: true,
                  originalPrice: true,
                  description: true,
                  category: {
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      // Define a type for the product with optional fields
      type WishlistProduct = {
        id: string;
        name: string;
        slug: string;
        price: number;
        images: Prisma.JsonValue;
        sku?: string;
        barcode?: string | null;
        weight?: number | null;
        dimensions?: string | null;
        expiryDate?: Date | null;
        isFeatured?: boolean;
        tags?: string;
        metaTitle?: string | null;
        metaDescription?: string | null;
        brand?: {
          id: string;
          name: string;
          // Add other brand properties as needed
        } | null;
        brandId?: string | null;
        supplierId?: string | null;
      };

      // Type assertion with proper type safety
      wishlist = {
        ...newWishlist,
        items: (newWishlist.items || []).map((item) => {
          const product = item.product as WishlistProduct;
          return {
            ...item,
            product: {
              ...product,
              // Add any missing required fields with default values
              sku: product.sku || "",
              barcode: product.barcode ?? null,
              weight: product.weight ?? null,
              dimensions: product.dimensions ?? null,
              expiryDate: product.expiryDate ?? null,
              isFeatured: product.isFeatured ?? false,
              tags: product.tags || "",
              metaTitle: product.metaTitle ?? null,
              metaDescription: product.metaDescription ?? null,
              brand: product.brand ?? null,
              brandId: product.brandId ?? null,
              supplierId: product.supplierId ?? null,
              // Timestamps
              createdAt:
                (product as unknown as { createdAt?: Date }).createdAt ||
                new Date(),
              updatedAt:
                (product as unknown as { updatedAt?: Date }).updatedAt ||
                new Date(),
            },
          };
        }),
      } as unknown as WishlistWithItems;
    }

    // Filter out products already in wishlist
    const existingWishlistItemIds = wishlist.items.map(
      (item) => item.productId,
    );
    const newProductIds = existingProductIds.filter(
      (id) => !existingWishlistItemIds.includes(id),
    );

    // Add new products to wishlist
    if (newProductIds.length > 0) {
      await prisma.wishlist.update({
        where: { id: wishlist.id },
        data: {
          items: {
            createMany: {
              data: newProductIds.map((productId) => ({
                productId,
              })),
            },
          },
        },
      });
    }

    // Get updated wishlist with product details
    const updatedWishlist = await prisma.wishlist.findUnique({
      where: { id: wishlist.id },
      include: {
        items: {
          select: {
            id: true,
            addedAt: true,
            updatedAt: true,
            rating: true,
            notes: true,
            product: {
              select: {
                id: true,
                name: true,
                price: true,
                images: true,
                stock: true,
                isActive: true,
                slug: true,
                rating: true,
                reviewCount: true,
                category: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                  },
                },
              },
            },
            wishlist: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    return successResponse({
      data: {
        wishlist: updatedWishlist,
        added: newProductIds.length,
        alreadyInWishlist: existingWishlistItemIds.filter((id) =>
          existingProductIds.includes(id),
        ).length,
        invalidProducts: invalidProductIds,
      },
      message: `Successfully added ${newProductIds.length} items to wishlist`,
    });
  } catch (error) {
    console.error("Error adding multiple items to wishlist:", error);
    return serverErrorResponse("Failed to add items to wishlist");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return unauthorizedResponse(
        "You must be logged in to update your wishlist",
      );
    }

    // Validate request body
    const body = await request.json();
    const validation = wishlistItemSchema.safeParse(body);

    if (!validation.success) {
      return badRequestResponse("Validation error", validation.error.format());
    }

    const { productId } = validation.data;

    // Get user's wishlist with the specific item
    const wishlist = await prisma.wishlist.findFirst({
      where: {
        userId: session.user.id,
        isDefault: true,
      },
      include: {
        items: {
          where: { productId },
        },
      },
    });

    if (!wishlist) {
      return errorResponse("Wishlist not found", 404);
    }

    const wishlistItem = wishlist.items[0];
    if (!wishlistItem) {
      return errorResponse("Product not found in wishlist", 404);
    }

    // Remove item from wishlist
    await prisma.wishlistItem.delete({
      where: { id: wishlistItem.id },
    });

    // Get updated wishlist
    const updatedWishlist = await prisma.wishlist.findUnique({
      where: { id: wishlist.id },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                price: true,
                images: true,
                stock: true,
                isActive: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    return successResponse({
      data: updatedWishlist,
      message: "Product removed from wishlist successfully",
    });
  } catch (error) {
    console.error("Error removing item from wishlist:", error);
    return serverErrorResponse("Failed to remove item from wishlist");
  }
}
