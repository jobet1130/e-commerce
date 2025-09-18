import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminOrManager } from "@/middleware/auth";
import {
  successResponse,
  errorResponse,
  notFoundResponse,
  serverErrorResponse,
} from "@/lib/api/api-response";
import { isAdminUser } from "@/middleware/admin";

// GET /api/products/[id] - Get a single product
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const product = await prisma.product.findUnique({
      where: { id: params.id },
      include: {
        category: true,
        brand: true,
        supplier: true,
        reviews: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                profileImage: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        _count: {
          select: { reviews: true },
        },
      },
    });

    if (!product) {
      return notFoundResponse("Product not found");
    }

    return successResponse({ data: product });
  } catch (error) {
    console.error("Error fetching product:", error);
    return serverErrorResponse("Failed to fetch product");
  }
}

// PATCH /api/products/[id] - Update a product (admin/manager only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    // Check admin/manager access
    const authResponse = await requireAdminOrManager(request);
    if (!isAdminUser(authResponse)) {
      return authResponse;
    }

    const data = await request.json();
    const productId = params.id;

    // Check if product exists
    const existingProduct = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!existingProduct) {
      return notFoundResponse("Product not found");
    }

    // Generate slug if name is being updated
    let slug = existingProduct.slug;
    if (data.name && data.name !== existingProduct.name) {
      slug = data.name
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/--+/g, "-");
    }

    // Handle stock changes
    let stockDifference = 0;
    if (
      typeof data.stock !== "undefined" &&
      data.stock !== existingProduct.stock
    ) {
      stockDifference = data.stock - existingProduct.stock;
    }

    // Update product
    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: {
        ...data,
        slug,
        tags: Array.isArray(data.tags) ? data.tags.join(",") : data.tags,
      },
      include: {
        category: true,
        brand: true,
        supplier: true,
      },
    });

    // Create inventory log if stock changed
    if (stockDifference !== 0) {
      await prisma.inventoryLog.create({
        data: {
          productId: productId,
          type: stockDifference > 0 ? "STOCK_IN" : "STOCK_OUT",
          quantity: Math.abs(stockDifference),
          note: "Stock updated",
          createdById: authResponse.userId,
        },
      });
    }

    return successResponse({
      data: updatedProduct,
      message: "Product updated successfully",
    });
  } catch (error: unknown) {
    console.error("Error updating product:", error);

    if (error instanceof Error) {
      // Check for Prisma unique constraint violation
      if ("code" in error && error.code === "P2002") {
        return errorResponse("A product with this slug already exists", 409);
      }

      // You can add more specific error handling here if needed
      console.error("Error details:", error.message);
    }

    return serverErrorResponse("Failed to update product");
  }
}

// DELETE /api/products/[id] - Delete a product (admin/manager only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    // Check admin/manager access
    const authResponse = await requireAdminOrManager(request);
    if (!isAdminUser(authResponse)) {
      return authResponse;
    }

    const productId = params.id;

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      return notFoundResponse("Product not found");
    }

    // Soft delete by setting isActive to false
    await prisma.product.update({
      where: { id: productId },
      data: { isActive: false },
    });

    return successResponse({
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    return serverErrorResponse("Failed to delete product");
  }
}
