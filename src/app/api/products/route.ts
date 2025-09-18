import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireAdminOrManager } from "@/middleware/auth";
import {
  successResponse,
  errorResponse,
  serverErrorResponse,
  badRequestResponse,
} from "@/lib/api/api-response";
import { isAdminUser } from "@/middleware/admin";

// GET /api/products - List products with filtering, sorting, and pagination
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Pagination
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const skip = (page - 1) * limit;

    // Filters
    const categoryId = searchParams.get("categoryId");
    const brandId = searchParams.get("brandId");
    const supplierId = searchParams.get("supplierId");
    const minPrice = searchParams.get("minPrice");
    const maxPrice = searchParams.get("maxPrice");
    const tags = searchParams.get("tags");
    const search = searchParams.get("search");
    const isFeatured = searchParams.get("isFeatured");
    const isActive = searchParams.get("isActive") ?? "true";

    // Sorting
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    // Build where clause
    const where: Prisma.ProductWhereInput = {};

    if (categoryId) where.categoryId = categoryId;
    if (brandId) where.brandId = brandId;
    if (supplierId) where.supplierId = supplierId;
    if (minPrice || maxPrice) {
      where.price = {
        ...(minPrice ? { gte: parseFloat(minPrice) } : {}),
        ...(maxPrice ? { lte: parseFloat(maxPrice) } : {}),
      };
    }
    if (tags) where.tags = { contains: tags };
    if (search) {
      // Convert search term to lowercase for case-insensitive matching
      const searchLower = search.toLowerCase();

      // Use raw SQL for case-insensitive search if needed
      // This is a more reliable approach than trying to use the mode property
      where.OR = [
        {
          // This will work if your database supports case-insensitive collation
          name: { contains: searchLower },
        },
        {
          description: { contains: searchLower },
        },
        {
          tags: {
            contains: searchLower,
            // Some databases support case-insensitive contains directly
            // If not, you might need to use raw SQL for this part
          },
        },
      ];
    }
    if (isFeatured) where.isFeatured = isFeatured === "true";
    if (isActive !== undefined) where.isActive = isActive === "true";

    // Get total count for pagination
    const total = await prisma.product.count({ where });

    // Get products with relations
    const products = await prisma.product.findMany({
      where,
      include: {
        category: true,
        brand: true,
        supplier: true,
        _count: {
          select: { reviews: true },
        },
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip,
      take: limit,
    });

    return successResponse({
      data: products,
      meta: {
        total,
        page,
        totalPages: Math.ceil(total / limit),
        limit,
      },
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return serverErrorResponse("Failed to fetch products");
  }
}

// POST /api/products - Create a new product (admin/manager only)
export async function POST(request: NextRequest) {
  try {
    // Check admin/manager access
    const authResponse = await requireAdminOrManager(request);
    if (!isAdminUser(authResponse)) {
      return authResponse;
    }

    const data = await request.json();

    // Basic validation
    if (!data.name || !data.price || !data.stock || !data.categoryId) {
      const errors: Record<string, string> = {};

      if (!data.name) errors.name = "Name is required";
      if (data.price === undefined) errors.price = "Price is required";
      if (data.stock === undefined) errors.stock = "Stock is required";
      if (!data.categoryId) errors.categoryId = "Category is required";

      return badRequestResponse("Validation failed", errors);
    }

    // Generate slug from name
    const slug = data.name
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/--+/g, "-");

    // Create product
    const product = await prisma.product.create({
      data: {
        ...data,
        slug,
        images: data.images || [],
        tags: Array.isArray(data.tags) ? data.tags.join(",") : data.tags || "",
      },
      include: {
        category: true,
        brand: data.brandId ? { select: { id: true, name: true } } : false,
        supplier: data.supplierId
          ? { select: { id: true, name: true } }
          : false,
      },
    });

    // Create inventory log for the initial stock
    if (data.stock > 0) {
      await prisma.inventoryLog.create({
        data: {
          productId: product.id,
          type: "STOCK_IN",
          quantity: data.stock,
          note: "Initial stock",
          createdById: authResponse.userId,
        },
      });
    }

    return successResponse(
      {
        data: product,
        message: "Product created successfully",
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("Error creating product:", error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return errorResponse("A product with this slug already exists", 409);
      }
    }

    return serverErrorResponse("Failed to create product");
  }
}
