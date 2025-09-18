import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { OrderStatus, PaymentMethod } from "@prisma/client";
import {
  successResponse,
  unauthorizedResponse,
  serverErrorResponse,
  badRequestResponse,
} from "@/lib/api/api-response";

// Validation schemas
const checkoutSchema = z.object({
  shippingAddressId: z.string().min(1, "Shipping address is required"),
  billingAddressId: z.string().optional(),
  couponCode: z.string().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod),
  notes: z.string().optional(),
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
  trackingNumber: z.string().optional(),
  carrier: z.string().optional(),
});

// Checkout - Validate cart and prepare order
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return unauthorizedResponse("You must be logged in to checkout");
    }

    // Validate request body
    const body = await request.json();
    const validation = checkoutSchema.safeParse(body);
    if (!validation.success) {
      // Format the Zod error using the format() method
      return badRequestResponse(
        "Invalid request data",
        validation.error.format(),
      );
    }

    const {
      shippingAddressId,
      billingAddressId,
      couponCode,
      paymentMethod,
      notes,
    } = validation.data;

    // 1. Get user's cart with items
    const cart = await prisma.cart.findUnique({
      where: { userId: session.user.id },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      return badRequestResponse("Your cart is empty");
    }

    // 2. Validate cart items (check stock, etc.)
    const outOfStockItems = [];
    for (const item of cart.items) {
      if (item.quantity > item.product.stock) {
        outOfStockItems.push({
          productId: item.productId,
          name: item.product.name,
          available: item.product.stock,
        });
      }
    }

    if (outOfStockItems.length > 0) {
      return badRequestResponse("Some items are out of stock", {
        outOfStockItems,
        _errors: ["Some items are out of stock"],
      } as const);
    }

    // 3. Calculate subtotal
    const subtotal = cart.items.reduce(
      (sum, item) => sum + item.quantity * item.product.price,
      0,
    );

    // 4. Apply coupon if provided
    let discountAmount = 0;
    let couponId = null;

    if (couponCode) {
      const coupon = await prisma.coupon.findUnique({
        where: { code: couponCode, isActive: true },
      });

      if (coupon) {
        couponId = coupon.id;
        if (coupon.discountType === "PERCENTAGE") {
          discountAmount = (subtotal * coupon.discountValue) / 100;
        } else {
          discountAmount = Math.min(coupon.discountValue, subtotal);
        }
      }
    }

    // 5. Calculate total
    const shippingFee = 0; // Implement your shipping calculation logic
    const taxRate = 0.1; // 10% tax, adjust as needed
    const tax = (subtotal - discountAmount) * taxRate;
    const total = subtotal - discountAmount + shippingFee + tax;

    // 6. Create order data
    const orderData = {
      userId: session.user.id,
      status: OrderStatus.PENDING,
      subtotal,
      discount: discountAmount,
      tax,
      shippingFee,
      total,
      paymentMethod,
      paymentStatus: "PENDING",
      shippingAddressId,
      billingAddressId: billingAddressId || shippingAddressId,
      couponId,
      notes,
      items: {
        create: cart.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.product.price,
          originalPrice: item.product.originalPrice || item.product.price,
        })),
      },
    };

    // 7. Start a transaction
    const order = await prisma.$transaction(async (tx) => {
      // Create the order
      const newOrder = await tx.order.create({
        data: orderData,
        include: {
          items: true,
          shippingAddress: true,
          billingAddress: true,
          ...(couponId && { coupon: true }), // Only include coupon if couponId exists
        },
      });

      // Update product stock
      for (const item of cart.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      // Clear the cart
      await tx.cartItem.deleteMany({
        where: { cartId: cart.id },
      });

      // Update cart total
      await tx.cart.update({
        where: { id: cart.id },
        data: { total: 0 },
      });

      return newOrder;
    });

    // 8. Process payment (this would be integrated with your payment gateway)
    // For now, we'll just return the order

    return successResponse({
      data: order,
      message: "Order created successfully. Redirecting to payment...",
    });
  } catch (error) {
    console.error("Error during checkout:", error);
    return serverErrorResponse("Failed to process checkout");
  }
}

// Get order history for the current user
// Update order status
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("orderId");

    if (!orderId) {
      return badRequestResponse("Order ID is required");
    }

    const data = await request.json();
    const validation = updateStatusSchema.safeParse(data);

    if (!validation.success) {
      return badRequestResponse("Invalid data", validation.error.format());
    }

    // Verify the order exists and belongs to the user
    const order = await prisma.order.findUnique({
      where: { id: orderId, userId: session.user.id },
    });

    if (!order) {
      return badRequestResponse("Order not found or access denied");
    }

    // Update the order with new status and tracking info
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: validation.data.status,
        trackingNumber: validation.data.trackingNumber,
        carrier: validation.data.carrier,
        updatedAt: new Date(),
      },
    });

    return successResponse({
      ...updatedOrder,
      message: "Order status updated successfully",
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    return serverErrorResponse("Failed to update order status");
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return unauthorizedResponse("You must be logged in to view orders");
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const status = searchParams.get("status") as OrderStatus | null;

    const where = {
      userId: session.user.id,
      ...(status && { status }),
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  images: true,
                },
              },
            },
          },
          shippingAddress: true,
          billingAddress: true,
        },
      }),
      prisma.order.count({ where }),
    ]);

    return successResponse({
      data: {
        orders,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return serverErrorResponse("Failed to fetch orders");
  }
}
