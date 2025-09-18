import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { OrderStatus, Role } from "@prisma/client";
import {
  successResponse,
  unauthorizedResponse,
  serverErrorResponse,
  badRequestResponse,
  notFoundResponse,
  forbiddenResponse,
} from "@/lib/api/api-response";

// Get order details
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return unauthorizedResponse("You must be logged in to view this order");
    }

    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                images: true,
                price: true,
              },
            },
          },
        },
        shippingAddress: true,
        billingAddress: true,
        coupon: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!order) {
      return notFoundResponse("Order not found");
    }

    // Only the order owner or admin can view the order
    if (order.userId !== session.user.id && session.user.role !== Role.ADMIN) {
      return forbiddenResponse("You don't have permission to view this order");
    }

    return successResponse({
      data: order,
    });
  } catch (error) {
    console.error("Error fetching order:", error);
    return serverErrorResponse("Failed to fetch order");
  }
}

// Update order status (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return unauthorizedResponse("You must be logged in to update an order");
    }

    // Only admin can update order status
    if (session.user.role !== Role.ADMIN) {
      return forbiddenResponse("You don't have permission to update orders");
    }

    // Validate request body
    const body = await request.json();
    const validation = z
      .object({
        status: z.nativeEnum(OrderStatus),
        trackingNumber: z.string().optional(),
        carrier: z.string().optional(),
      })
      .safeParse(body);

    if (!validation.success) {
      // Format Zod validation errors to match ErrorObject type
      const formattedErrors = validation.error.format();
      return badRequestResponse("Invalid request data", {
        errors: formattedErrors,
      });
    }

    const { status, trackingNumber, carrier } = validation.data;

    // Get the current order
    const currentOrder = await prisma.order.findUnique({
      where: { id: params.id },
    });

    if (!currentOrder) {
      return notFoundResponse("Order not found");
    }

    // Update the order status
    const updatedOrder = await prisma.order.update({
      where: { id: params.id },
      data: {
        status,
        ...(trackingNumber && { trackingNumber }),
        ...(carrier && { carrier }),
        ...(status === "SHIPPED" && { shippedAt: new Date() }),
        ...(status === "DELIVERED" && { deliveredAt: new Date() }),
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // TODO: Send email notification to user about status update

    return successResponse({
      data: updatedOrder,
      message: `Order status updated to ${status}`,
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    return serverErrorResponse("Failed to update order status");
  }
}
