'use strict';

import { factories } from '@strapi/strapi';

interface Producto {
  id: number;
  stock_actual: number;
  precio_venta: number;
  Nombre?: string;
}

interface ProductoVenta {
  id: number;
  cantidad: number;
}

interface CrearVentaRequestBody {
  productos: ProductoVenta[];
  fecha?: string;
}

export default factories.createCoreController('api::venta.venta', ({ strapi }) => ({
  
  /**
   * Endpoint personalizado para crear una venta
   * POST /api/ventas/crear-venta
   * Body: { productos: [{ id: number, cantidad: number }], fecha?: string }
   */
  async crearVenta(ctx) {
    const { productos, fecha } = ctx.request.body as CrearVentaRequestBody;

    // Validar que hay productos
    if (!productos || !Array.isArray(productos) || productos.length === 0) {
      return ctx.throw(400, 'Debe proporcionar al menos un producto con su cantidad.');
    }

    let totalCalculado = 0;
    const detallesParaCrear: Array<{
      producto: number;
      cantidad: number;
      precio_unitario: number;
    }> = [];
    const productosParaValidar: Producto[] = [];

    // Validar productos y calcular totales
    for (const item of productos) {
      if (!item.id || !item.cantidad || item.cantidad <= 0) {
        return ctx.throw(400, `Producto inválido: debe tener id y cantidad mayor a 0.`);
      }

      const producto = await strapi.db.query('api::producto.producto').findOne({
        where: { id: item.id }
      }) as Producto | null;
      
      if (!producto) {
        return ctx.throw(404, `Producto con ID ${item.id} no encontrado.`);
      }

      // Verificar stock suficiente
      if (producto.stock_actual < item.cantidad) {
        return ctx.throw(400, `Stock insuficiente para el producto "${producto.Nombre || item.id}". Stock disponible: ${producto.stock_actual}, Solicitado: ${item.cantidad}`);
      }

      // Obtener precio de venta actual del producto
      const precioVenta = producto.precio_venta;
      totalCalculado += precioVenta * item.cantidad;

      detallesParaCrear.push({
        producto: producto.id,
        cantidad: item.cantidad,
        precio_unitario: precioVenta,
      });
      
      productosParaValidar.push(producto);
    }

    try {
      // Crear la venta
      const nuevaVenta = await strapi.db.query('api::venta.venta').create({
        data: {
          fecha: fecha ? new Date(fecha) : new Date(),
          total: totalCalculado,
          cancelada: false,
          publishedAt: new Date(),
        },
      });

      // Crear detalles de venta y debitar stock
      for (let i = 0; i < productos.length; i++) {
        const item = productos[i];
        const detalle = detallesParaCrear[i];
        const producto = productosParaValidar[i];
        
        // Crear detalle de venta con precio_unitario del producto
        await strapi.db.query('api::detalle-venta.detalle-venta').create({
          data: {
            producto: detalle.producto,
            cantidad: detalle.cantidad,
            precio_unitario: detalle.precio_unitario,
            venta: nuevaVenta.id,
            publishedAt: new Date(),
          },
        });

        // Debitar stock del producto
        await strapi.db.query('api::producto.producto').update({
          where: { id: item.id },
          data: {
            stock_actual: producto.stock_actual - item.cantidad,
          },
        });
        
      }

      // Obtener la venta completa con detalles para retornarla
      const ventaCompleta = await strapi.db.query('api::venta.venta').findOne({
        where: { id: nuevaVenta.id },
        populate: ['detalle_ventas', 'detalle_ventas.producto'],
      });

      return this.transformResponse(ventaCompleta);

    } catch (error) {
      strapi.log.error('Error al crear la venta:', error);
      return ctx.throw(500, 'Error interno al procesar la venta.');
    }
  },

  /**
   * Endpoint personalizado para cancelar una venta
   * POST /api/ventas/cancelar-venta/:id
   */
  async cancelarVenta(ctx) {
    const { id } = ctx.params;

    if (!id) {
      return ctx.throw(400, 'Debe proporcionar el ID de la venta a cancelar.');
    }

    // Obtener la venta con sus detalles
    const venta = await strapi.db.query('api::venta.venta').findOne({
      where: { id },
      populate: ['detalle_ventas', 'detalle_ventas.producto'],
    });

    if (!venta) {
      return ctx.throw(404, `Venta con ID ${id} no encontrada.`);
    }

    if (venta.cancelada) {
      return ctx.throw(400, 'La venta ya está cancelada.');
    }

    try {
      // Reponer stock de los productos basado en detalle_venta
      if (venta.detalle_ventas && venta.detalle_ventas.length > 0) {
        for (const detalle of venta.detalle_ventas) {
          const productoId = typeof detalle.producto === 'object' 
            ? detalle.producto.id 
            : detalle.producto;

          if (productoId) {
            // Obtener producto actual para verificar stock
            const producto = await strapi.db.query('api::producto.producto').findOne({
              where: { id: productoId },
            });

            if (producto) {
              // Reponer stock
              await strapi.db.query('api::producto.producto').update({
                where: { id: productoId },
                data: {
                  stock_actual: producto.stock_actual + detalle.cantidad,
                },
              });

            }
          }
        }
      }

      // Cambiar estado de la venta a cancelada
      const ventaCancelada = await strapi.db.query('api::venta.venta').update({
        where: { id },
        data: {
          cancelada: true,
        },
        populate: ['detalle_ventas', 'detalle_ventas.producto'],
      });

      return this.transformResponse(ventaCancelada);

    } catch (error) {
      strapi.log.error('Error al cancelar la venta:', error);
      return ctx.throw(500, 'Error interno al cancelar la venta.');
    }
  },
}));

