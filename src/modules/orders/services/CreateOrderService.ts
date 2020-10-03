import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const existingCustomer = await this.customersRepository.findById(
      customer_id,
    );

    if (!existingCustomer) {
      throw new AppError('Customer with given id not found.');
    }

    const existingProducts = await this.productsRepository.findAllById(
      products,
    );

    if (!existingProducts.length) {
      throw new AppError('Products with given ids not found.');
    }

    const existingProductsIds = existingProducts.map(product => product.id);

    const inexistingProducts = products.filter(
      product => !existingProductsIds.includes(product.id),
    );

    if (inexistingProducts.length) {
      throw new AppError(
        `At least one product couldn't be found: ${inexistingProducts[0].id}.`,
      );
    }

    // TODO - improve this filtering
    const productsWithNoQuantityAvailable = products.filter(
      product =>
        existingProducts.filter(prod => prod.id === product.id)[0].quantity <
        product.quantity,
    );

    if (productsWithNoQuantityAvailable.length) {
      throw new AppError(
        `Product with id ${productsWithNoQuantityAvailable[0].id} does not have quantity ${productsWithNoQuantityAvailable[0].quantity}.`,
      );
    }

    const serializedProducts = products.map(product => ({
      product_id: product.id,
      quantity: product.quantity,
      price: existingProducts.filter(p => p.id === product.id)[0].price,
    }));

    const order = await this.ordersRepository.create({
      customer: existingCustomer,
      products: serializedProducts,
    });

    const { order_products } = order;

    const orderedProductsQuantity = order_products.map(product => ({
      id: product.product_id,
      quantity:
        existingProducts.filter(prod => prod.id === product.product_id)[0]
          .quantity - product.quantity,
    }));

    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
