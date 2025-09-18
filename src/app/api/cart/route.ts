import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/lib/api/api-response";

// GET /api/cart - Get user's cart
// POST /api/cart - Add item to cart
// PUT /api/cart - Update cart item quantity
// DELETE /api/cart - Remove item from cart
// DELETE /api/cart/clear - Clear cart

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return unauthorizedResponse("You must be logged in to view your cart");
    }

    // Get user's cart with items and product details
    const cart = await prisma.cart.findUnique({
      where: { userId: session.user.id },
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
              },
            },
          },
        },
      },
    });

    if (!cart) {
      // Create an empty cart if it doesn't exist
      const newCart = await prisma.cart.create({
        data: {
          user: { connect: { id: session.user.id } },
          total: 0,
        },
        include: {
          items: true,
        },
      });
      return successResponse({ data: newCart });
    }

    // Calculate cart total
    const total = cart.items.reduce((sum, item) => {
      return sum + item.priceAtTime * item.quantity;
    }, 0);

    // Update cart total if it's out of sync
    if (total !== cart.total) {
      await prisma.cart.update({
        where: { id: cart.id },
        data: { total },
      });
    }

    return successResponse({ data: { ...cart, total } });
  } catch (error) {
    console.error("Error fetching cart:", error);
    return serverErrorResponse("Failed to fetch cart");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return unauthorizedResponse("You must be logged in to add to cart");
    }

    const { productId, quantity = 1 } = await request.json();

    if (!productId) {
      return errorResponse("Product ID is required", 400);
    }

    // Get or create user's cart
    let cart = await prisma.cart.findUnique({
      where: { userId: session.user.id },
      include: { items: true },
    });

    if (!cart) {
      cart = await prisma.cart.create({
        data: {
          user: { connect: { id: session.user.id } },
          total: 0,
        },
        include: { items: true },
      });
    }

    // Check if product exists and is active
    const product = await prisma.product.findUnique({
      where: { id: productId, isActive: true },
    });

    if (!product) {
      return errorResponse("Product not found or unavailable", 404);
    }

    // Check stock
    if (product.stock < quantity) {
      return errorResponse("Insufficient stock", 400);
    }

    // Check if item already in cart
    const existingItem = cart.items.find(
      (item) => item.productId === productId,
    );
    let updatedCart;

    if (existingItem) {
      // Update quantity if item already in cart
      const newQuantity = existingItem.quantity + quantity;

      if (product.stock < newQuantity) {
        return errorResponse(
          "Insufficient stock for the requested quantity",
          400,
        );
      }

      updatedCart = await prisma.cart.update({
        where: { id: cart.id },
        data: {
          items: {
            update: {
              where: { id: existingItem.id },
              data: { quantity: newQuantity },
            },
          },
          total: cart.total + product.price * quantity,
        },
        include: { items: true },
      });
    } else {
      // Add new item to cart
      updatedCart = await prisma.cart.update({
        where: { id: cart.id },
        data: {
          items: {
            create: {
              product: { connect: { id: productId } },
              quantity,
              priceAtTime: product.price,
            },
          },
          total: cart.total + product.price * quantity,
        },
        include: { items: true },
      });
    }

    return successResponse({
      data: updatedCart,
      message: "Item added to cart successfully",
    });
  } catch (error) {
    console.error("Error adding to cart:", error);
    return serverErrorResponse("Failed to add item to cart");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return unauthorizedResponse("You must be logged in to update your cart");
    }

    const { productId, quantity } = await request.json();

    if (!productId || quantity === undefined || quantity < 0) {
      return errorResponse("Product ID and valid quantity are required", 400);
    }

    // Get user's cart
    const cart = await prisma.cart.findUnique({
      where: { userId: session.user.id },
      include: {
        items: {
          where: { productId },
          include: { product: true },
        },
      },
    });

    if (!cart) {
      return errorResponse("Cart not found", 404);
    }

    const cartItem = cart.items[0];
    if (!cartItem) {
      return errorResponse("Item not found in cart", 404);
    }

    // If quantity is 0, remove the item
    if (quantity === 0) {
      // Create a new NextRequest with the same URL and method
      const deleteRequest = new NextRequest(request.url, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...request.headers,
        },
        body: JSON.stringify({ productId }),
      });
      return DELETE(deleteRequest);
    }

    // Check stock
    if (cartItem.product.stock < quantity) {
      return errorResponse("Insufficient stock", 400);
    }

    // Calculate price difference
    const priceDifference =
      (quantity - cartItem.quantity) * cartItem.priceAtTime;

    // Update cart item quantity
    const updatedCart = await prisma.cart.update({
      where: { id: cart.id },
      data: {
        items: {
          update: {
            where: { id: cartItem.id },
            data: { quantity },
          },
        },
        total: cart.total + priceDifference,
      },
      include: { items: true },
    });

    return successResponse({
      data: updatedCart,
      message: "Cart updated successfully",
    });
  } catch (error) {
    console.error("Error updating cart:", error);
    return serverErrorResponse("Failed to update cart");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return unauthorizedResponse("You must be logged in to update your cart");
    }

    const { productId } = await request.json();

    if (!productId) {
      return errorResponse("Product ID is required", 400);
    }

    // Get user's cart with the specific item
    const cart = await prisma.cart.findUnique({
      where: { userId: session.user.id },
      include: {
        items: {
          where: { productId },
          include: { product: true },
        },
      },
    });

    if (!cart) {
      return errorResponse("Cart not found", 404);
    }

    const cartItem = cart.items[0];
    if (!cartItem) {
      return errorResponse("Item not found in cart", 404);
    }

    // Calculate price to subtract from total
    const priceToSubtract = cartItem.priceAtTime * cartItem.quantity;

    // Remove item from cart
    await prisma.cartItem.delete({
      where: { id: cartItem.id },
    });

    // Update cart total
    const updatedCart = await prisma.cart.update({
      where: { id: cart.id },
      data: {
        total: Math.max(0, cart.total - priceToSubtract),
      },
      include: { items: true },
    });

    return successResponse({
      data: updatedCart,
      message: "Item removed from cart successfully",
    });
  } catch (error) {
    console.error("Error removing item from cart:", error);
    return serverErrorResponse("Failed to remove item from cart");
  }
}
