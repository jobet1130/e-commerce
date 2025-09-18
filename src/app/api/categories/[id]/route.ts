import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminOrManager } from "@/middleware/auth";
import { Prisma } from "@prisma/client";
import {
  successResponse,
  errorResponse,
  notFoundResponse,
  serverErrorResponse,
} from "@/lib/api/api-response";
import { isAdminUser } from "@/middleware/admin";

// GET /api/categories/[id] - Get a single category with its children
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const category = await prisma.category.findUnique({
      where: { id: params.id },
      include: {
        children: {
          where: { isActive: true },
          include: {
            _count: {
              select: { products: { where: { isActive: true } } },
            },
          },
        },
        parent: true,
        _count: {
          select: { products: { where: { isActive: true } } },
        },
      },
    });

    if (!category) {
      return notFoundResponse("Category not found");
    }

    return successResponse({ data: category });
  } catch (error) {
    console.error("Error fetching category:", error);
    return serverErrorResponse("Failed to fetch category");
  }
}

// PATCH /api/categories/[id] - Update a category (admin/manager only)
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
    const categoryId = params.id;

    // Check if category exists
    const existingCategory = await prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!existingCategory) {
      return notFoundResponse("Category not found");
    }

    // Prevent making a category its own parent
    if (data.parentId === categoryId) {
      return errorResponse("A category cannot be its own parent", 400);
    }

    // Check for circular references
    if (data.parentId) {
      let currentParentId = data.parentId;
      while (currentParentId) {
        if (currentParentId === categoryId) {
          return errorResponse(
            "Circular reference detected in category hierarchy",
            400,
          );
        }
        const parent = await prisma.category.findUnique({
          where: { id: currentParentId },
          select: { parentId: true },
        });
        currentParentId = parent?.parentId || null;
      }
    }

    // Generate slug if name is being updated
    let slug = existingCategory.slug;
    if (data.name && data.name !== existingCategory.name) {
      slug = data.name
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/--+/g, "-");
    }

    // Update category
    const updatedCategory = await prisma.category.update({
      where: { id: categoryId },
      data: {
        ...data,
        slug,
      },
      include: {
        parent: true,
        children: true,
      },
    });

    return successResponse({
      data: updatedCategory,
      message: "Category updated successfully",
    });
  } catch (error: unknown) {
    console.error("Error updating category:", error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return errorResponse("A category with this slug already exists", 409);
      }
    }

    return serverErrorResponse("Failed to update category");
  }
}

// DELETE /api/categories/[id] - Delete a category (admin/manager only)
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

    const categoryId = params.id;

    // Check if category exists
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      include: {
        _count: {
          select: {
            children: true,
            products: true,
          },
        },
      },
    });

    if (!category) {
      return notFoundResponse("Category not found");
    }

    // Check if category has children
    if (category._count.children > 0) {
      return errorResponse("Cannot delete a category with subcategories", 400);
    }

    // Check if category has products
    if (category._count.products > 0) {
      return errorResponse("Cannot delete a category with products", 400);
    }

    // Soft delete by setting isActive to false
    await prisma.category.update({
      where: { id: categoryId },
      data: { isActive: false },
    });

    return successResponse({
      message: "Category deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting category:", error);
    return serverErrorResponse("Failed to delete category");
  }
}
