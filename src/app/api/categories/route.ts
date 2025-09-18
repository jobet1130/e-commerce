import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminOrManager } from "@/middleware/auth";
import {
  successResponse,
  errorResponse,
  serverErrorResponse,
  validationErrorResponse,
} from "@/lib/api/api-response";
import { isAdminUser } from "@/middleware/admin";

// GET /api/categories - Get all categories in a tree structure
export async function GET() {
  try {
    // Fetch all categories
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: { products: { where: { isActive: true } } },
        },
      },
    });

    // Build tree structure
    const buildTree = (parentId: string | null = null) => {
      return categories
        .filter((category) => category.parentId === parentId)
        .map((category) => ({
          ...category,
          children: buildTree(category.id),
        }));
    };

    const tree = buildTree();

    return successResponse({ data: tree });
  } catch (error) {
    console.error("Error fetching categories:", error);
    return serverErrorResponse("Failed to fetch categories");
  }
}

// POST /api/categories - Create a new category (admin/manager only)
export async function POST(request: NextRequest) {
  try {
    // Check admin/manager access
    const authResponse = await requireAdminOrManager(request);
    if (!isAdminUser(authResponse)) {
      return authResponse;
    }

    const data = await request.json();

    // Basic validation
    if (!data.name) {
      return validationErrorResponse({
        name: "Name is required",
      });
    }

    // Generate slug from name
    const slug = data.name
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/--+/g, "-");

    // Check if parent exists if parentId is provided
    if (data.parentId) {
      const parentExists = await prisma.category.findUnique({
        where: { id: data.parentId },
      });

      if (!parentExists) {
        return errorResponse("Parent category not found", 404);
      }
    }

    // Create category
    const category = await prisma.category.create({
      data: {
        ...data,
        slug,
      },
    });

    return successResponse(
      {
        data: category,
        message: "Category created successfully",
      },
      201,
    );
  } catch (error: any) {
    console.error("Error creating category:", error);

    if (error.code === "P2002") {
      return errorResponse("A category with this slug already exists", 409);
    }

    return serverErrorResponse("Failed to create category");
  }
}
