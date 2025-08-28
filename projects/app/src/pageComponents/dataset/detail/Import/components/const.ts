export const mockData = [
  {
    tableName: "users",
    description: "用户基本信息表",
    enabled: true,
    columns: {
      id: {
        columnName: "id",
        columnType: "VARCHAR(36)",
        description: "用户唯一标识符",
        examples: ["user_001", "user_002"],
        enabled: true,
        valueIndex: true
      },
      username: {
        columnName: "username",
        columnType: "VARCHAR(50)",
        description: "用户名",
        examples: ["john_doe", "jane_smith"],
        enabled: true,
        valueIndex: false
      },
      email: {
        columnName: "email",
        columnType: "VARCHAR(100)",
        description: "用户邮箱地址",
        examples: ["john@example.com", "jane@example.com"],
        enabled: true,
        valueIndex: false
      },
      created_at: {
        columnName: "created_at",
        columnType: "TIMESTAMP",
        description: "创建时间1",
        examples: ["2023-01-01 00:00:00", "2023-01-02 00:00:00"],
        enabled: true,
        valueIndex: false
      },
      created_at2: {
        columnName: "created_at",
        columnType: "TIMESTAMP",
        description: "创建时间2",
        examples: ["2023-01-01 00:00:00", "2023-01-02 00:00:00"],
        enabled: true,
        valueIndex: false
      },
      created_at3: {
        columnName: "created_at",
        columnType: "TIMESTAMP",
        description: "创建时间3",
        examples: ["2023-01-01 00:00:00", "2023-01-02 00:00:00"],
        enabled: true,
        valueIndex: false
      },
      created_at4: {
        columnName: "created_at",
        columnType: "TIMESTAMP",
        description: "创建时间",
        examples: ["2023-01-01 00:00:00", "2023-01-02 00:00:00"],
        enabled: true,
        valueIndex: false
      },
      created_at5: {
        columnName: "created_at",
        columnType: "TIMESTAMP",
        description: "创建时间",
        examples: ["2023-01-01 00:00:00", "2023-01-02 00:00:00"],
        enabled: true,
        valueIndex: false
      },
      created_at6: {
        columnName: "created_at",
        columnType: "TIMESTAMP",
        description: "创建时间",
        examples: ["2023-01-01 00:00:00", "2023-01-02 00:00:00"],
        enabled: true,
        valueIndex: false
      },
    }
  },
  {
    tableName: "products",
    description: "商品信息表",
    enabled: true,
    columns: {
      product_id: {
        columnName: "product_id",
        columnType: "VARCHAR(36)",
        description: "商品唯一标识符",
        examples: ["prod_001", "prod_002"],
        enabled: true,
        valueIndex: true
      },
      name: {
        columnName: "name",
        columnType: "VARCHAR(100)",
        description: "商品名称",
        examples: ["iPhone 14", "MacBook Pro"],
        enabled: true,
        valueIndex: false
      },
      price: {
        columnName: "price",
        columnType: "DECIMAL(10,2)",
        description: "商品价格",
        examples: ["999.99", "1299.99"],
        enabled: true,
        valueIndex: false
      },
      stock: {
        columnName: "stock",
        columnType: "INT",
        description: "库存数量",
        examples: ["100", "50"],
        enabled: true,
        valueIndex: false
      }
    }
  },
  {
    tableName: "orders",
    description: "订单信息表",
    enabled: true,
    columns: {
      order_id: {
        columnName: "order_id",
        columnType: "VARCHAR(36)",
        description: "订单唯一标识符",
        examples: ["order_001", "order_002"],
        enabled: true,
        valueIndex: true
      },
      user_id: {
        columnName: "user_id",
        columnType: "VARCHAR(36)",
        description: "用户ID",
        examples: ["user_001", "user_002"],
        enabled: true,
        valueIndex: false
      },
      total_amount: {
        columnName: "total_amount",
        columnType: "DECIMAL(10,2)",
        description: "订单总金额",
        examples: ["199.99", "299.99"],
        enabled: true,
        valueIndex: false
      },
      status: {
        columnName: "status",
        columnType: "VARCHAR(20)",
        description: "订单状态",
        examples: ["pending", "completed"],
        enabled: true,
        valueIndex: false
      }
    }
  },
  {
    tableName: "categories",
    description: "商品分类表",
    enabled: true,
    columns: {
      category_id: {
        columnName: "category_id",
        columnType: "VARCHAR(36)",
        description: "分类唯一标识符",
        examples: ["cat_001", "cat_002"],
        enabled: true,
        valueIndex: true
      },
      name: {
        columnName: "name",
        columnType: "VARCHAR(50)",
        description: "分类名称",
        examples: ["Electronics", "Clothing"],
        enabled: true,
        valueIndex: false
      },
      parent_id: {
        columnName: "parent_id",
        columnType: "VARCHAR(36)",
        description: "父分类ID",
        examples: ["cat_000", "cat_001"],
        enabled: true,
        valueIndex: false
      }
    }
  },
  {
    tableName: "reviews",
    description: "商品评价表",
    enabled: true,
    columns: {
      review_id: {
        columnName: "review_id",
        columnType: "VARCHAR(36)",
        description: "评价唯一标识符",
        examples: ["rev_001", "rev_002"],
        enabled: true,
        valueIndex: true
      },
      product_id: {
        columnName: "product_id",
        columnType: "VARCHAR(36)",
        description: "商品ID",
        examples: ["prod_001", "prod_002"],
        enabled: true,
        valueIndex: false
      },
      user_id: {
        columnName: "user_id",
        columnType: "VARCHAR(36)",
        description: "用户ID",
        examples: ["user_001", "user_002"],
        enabled: true,
        valueIndex: false
      },
      rating: {
        columnName: "rating",
        columnType: "INT",
        description: "评分(1-5)",
        examples: ["5", "4"],
        enabled: true,
        valueIndex: false
      },
      comment: {
        columnName: "comment",
        columnType: "TEXT",
        description: "评价内容",
        examples: ["Great product!", "Good value for money"],
        enabled: true,
        valueIndex: false
      }
    }
  },
  {
    tableName: "payments",
    description: "支付信息表",
    enabled: true,
    columns: {
      payment_id: {
        columnName: "payment_id",
        columnType: "VARCHAR(36)",
        description: "支付唯一标识符",
        examples: ["pay_001", "pay_002"],
        enabled: true,
        valueIndex: true
      },
      order_id: {
        columnName: "order_id",
        columnType: "VARCHAR(36)",
        description: "订单ID",
        examples: ["order_001", "order_002"],
        enabled: true,
        valueIndex: false
      },
      amount: {
        columnName: "amount",
        columnType: "DECIMAL(10,2)",
        description: "支付金额",
        examples: ["199.99", "299.99"],
        enabled: true,
        valueIndex: false
      },
      payment_method: {
        columnName: "payment_method",
        columnType: "VARCHAR(20)",
        description: "支付方式",
        examples: ["credit_card", "paypal"],
        enabled: true,
        valueIndex: false
      },
      status: {
        columnName: "status",
        columnType: "VARCHAR(20)",
        description: "支付状态",
        examples: ["success", "failed"],
        enabled: true,
        valueIndex: false
      }
    }
  },
  {
    tableName: "addresses",
    description: "用户地址表",
    enabled: true,
    columns: {
      address_id: {
        columnName: "address_id",
        columnType: "VARCHAR(36)",
        description: "地址唯一标识符",
        examples: ["addr_001", "addr_002"],
        enabled: true,
        valueIndex: true
      },
      user_id: {
        columnName: "user_id",
        columnType: "VARCHAR(36)",
        description: "用户ID",
        examples: ["user_001", "user_002"],
        enabled: true,
        valueIndex: false
      },
      street: {
        columnName: "street",
        columnType: "VARCHAR(100)",
        description: "街道地址",
        examples: ["123 Main St", "456 Oak Ave"],
        enabled: true,
        valueIndex: false
      },
      city: {
        columnName: "city",
        columnType: "VARCHAR(50)",
        description: "城市",
        examples: ["New York", "Los Angeles"],
        enabled: true,
        valueIndex: false
      },
      zip_code: {
        columnName: "zip_code",
        columnType: "VARCHAR(10)",
        description: "邮政编码",
        examples: ["10001", "90001"],
        enabled: true,
        valueIndex: false
      }
    }
  },
  {
    tableName: "wishlists",
    description: "用户收藏表",
    enabled: true,
    columns: {
      wishlist_id: {
        columnName: "wishlist_id",
        columnType: "VARCHAR(36)",
        description: "收藏唯一标识符",
        examples: ["wish_001", "wish_002"],
        enabled: true,
        valueIndex: true
      },
      user_id: {
        columnName: "user_id",
        columnType: "VARCHAR(36)",
        description: "用户ID",
        examples: ["user_001", "user_002"],
        enabled: true,
        valueIndex: false
      },
      product_id: {
        columnName: "product_id",
        columnType: "VARCHAR(36)",
        description: "商品ID",
        examples: ["prod_001", "prod_002"],
        enabled: true,
        valueIndex: false
      },
      created_at: {
        columnName: "created_at",
        columnType: "TIMESTAMP",
        description: "收藏时间",
        examples: ["2023-01-01 00:00:00", "2023-01-02 00:00:00"],
        enabled: true,
        valueIndex: false
      }
    }
  },
  {
    tableName: "carts",
    description: "购物车表",
    enabled: true,
    columns: {
      cart_id: {
        columnName: "cart_id",
        columnType: "VARCHAR(36)",
        description: "购物车唯一标识符",
        examples: ["cart_001", "cart_002"],
        enabled: true,
        valueIndex: true
      },
      user_id: {
        columnName: "user_id",
        columnType: "VARCHAR(36)",
        description: "用户ID",
        examples: ["user_001", "user_002"],
        enabled: true,
        valueIndex: false
      },
      product_id: {
        columnName: "product_id",
        columnType: "VARCHAR(36)",
        description: "商品ID",
        examples: ["prod_001", "prod_002"],
        enabled: true,
        valueIndex: false
      },
      quantity: {
        columnName: "quantity",
        columnType: "INT",
        description: "商品数量",
        examples: ["1", "2"],
        enabled: true,
        valueIndex: false
      }
    }
  },
  {
    tableName: "discounts",
    description: "折扣信息表",
    enabled: true,
    columns: {
      discount_id: {
        columnName: "discount_id",
        columnType: "VARCHAR(36)",
        description: "折扣唯一标识符",
        examples: ["disc_001", "disc_002"],
        enabled: true,
        valueIndex: true
      },
      code: {
        columnName: "code",
        columnType: "VARCHAR(20)",
        description: "折扣码",
        examples: ["SAVE10", "SUMMER20"],
        enabled: true,
        valueIndex: false
      },
      percentage: {
        columnName: "percentage",
        columnType: "DECIMAL(5,2)",
        description: "折扣百分比",
        examples: ["10.00", "20.00"],
        enabled: true,
        valueIndex: false
      },
      valid_until: {
        columnName: "valid_until",
        columnType: "DATE",
        description: "有效期至",
        examples: ["2023-12-31", "2023-09-30"],
        enabled: true,
        valueIndex: false
      }
    }
  },
  {
    tableName: "shipments",
    description: "发货信息表",
    enabled: true,
    columns: {
      shipment_id: {
        columnName: "shipment_id",
        columnType: "VARCHAR(36)",
        description: "发货唯一标识符",
        examples: ["ship_001", "ship_002"],
        enabled: true,
        valueIndex: true
      },
      order_id: {
        columnName: "order_id",
        columnType: "VARCHAR(36)",
        description: "订单ID",
        examples: ["order_001", "order_002"],
        enabled: true,
        valueIndex: false
      },
      tracking_number: {
        columnName: "tracking_number",
        columnType: "VARCHAR(50)",
        description: "追踪号码",
        examples: ["TN123456", "TN789012"],
        enabled: true,
        valueIndex: false
      },
      carrier: {
        columnName: "carrier",
        columnType: "VARCHAR(30)",
        description: "承运商",
        examples: ["UPS", "FedEx"],
        enabled: true,
        valueIndex: false
      },
      status: {
        columnName: "status",
        columnType: "VARCHAR(20)",
        description: "发货状态",
        examples: ["shipped", "delivered"],
        enabled: true,
        valueIndex: false
      }
    }
  },
  {
    tableName: "refunds",
    description: "退款信息表",
    enabled: true,
    columns: {
      refund_id: {
        columnName: "refund_id",
        columnType: "VARCHAR(36)",
        description: "退款唯一标识符",
        examples: ["ref_001", "ref_002"],
        enabled: true,
        valueIndex: true
      },
      order_id: {
        columnName: "order_id",
        columnType: "VARCHAR(36)",
        description: "订单ID",
        examples: ["order_001", "order_002"],
        enabled: true,
        valueIndex: false
      },
      amount: {
        columnName: "amount",
        columnType: "DECIMAL(10,2)",
        description: "退款金额",
        examples: ["99.99", "149.99"],
        enabled: true,
        valueIndex: false
      },
      reason: {
        columnName: "reason",
        columnType: "TEXT",
        description: "退款原因",
        examples: ["Product defective", "Wrong item delivered"],
        enabled: true,
        valueIndex: false
      },
      status: {
        columnName: "status",
        columnType: "VARCHAR(20)",
        description: "退款状态",
        examples: ["approved", "rejected"],
        enabled: true,
        valueIndex: false
      }
    }
  },
  {
    tableName: "notifications",
    description: "通知信息表",
    enabled: true,
    columns: {
      notification_id: {
        columnName: "notification_id",
        columnType: "VARCHAR(36)",
        description: "通知唯一标识符",
        examples: ["not_001", "not_002"],
        enabled: true,
        valueIndex: true
      },
      user_id: {
        columnName: "user_id",
        columnType: "VARCHAR(36)",
        description: "用户ID",
        examples: ["user_001", "user_002"],
        enabled: true,
        valueIndex: false
      },
      type: {
        columnName: "type",
        columnType: "VARCHAR(20)",
        description: "通知类型",
        examples: ["order_update", "promotion"],
        enabled: true,
        valueIndex: false
      },
      message: {
        columnName: "message",
        columnType: "TEXT",
        description: "通知内容",
        examples: ["Your order has been shipped", "Special offer just for you"],
        enabled: true,
        valueIndex: false
      },
      read: {
        columnName: "read",
        columnType: "BOOLEAN",
        description: "是否已读",
        examples: ["true", "false"],
        enabled: true,
        valueIndex: false
      }
    }
  },
  {
    tableName: "logs",
    description: "系统日志表",
    enabled: true,
    columns: {
      log_id: {
        columnName: "log_id",
        columnType: "VARCHAR(36)",
        description: "日志唯一标识符",
        examples: ["log_001", "log_002"],
        enabled: true,
        valueIndex: true
      },
      user_id: {
        columnName: "user_id",
        columnType: "VARCHAR(36)",
        description: "用户ID",
        examples: ["user_001", "user_002"],
        enabled: true,
        valueIndex: false
      },
      action: {
        columnName: "action",
        columnType: "VARCHAR(50)",
        description: "操作类型",
        examples: ["login", "purchase"],
        enabled: true,
        valueIndex: false
      },
      timestamp: {
        columnName: "timestamp",
        columnType: "TIMESTAMP",
        description: "操作时间",
        examples: ["2023-01-01 12:00:00", "2023-01-02 12:00:00"],
        enabled: true,
        valueIndex: false
      },
      details: {
        columnName: "details",
        columnType: "TEXT",
        description: "操作详情",
        examples: ["User logged in from IP 192.168.1.1", "User purchased product prod_001"],
        enabled: true,
        valueIndex: false
      }
    }
  },
  {
    tableName: "settings",
    description: "系统设置表",
    enabled: true,
    columns: {
      setting_id: {
        columnName: "setting_id",
        columnType: "VARCHAR(36)",
        description: "设置唯一标识符",
        examples: ["set_001", "set_002"],
        enabled: true,
        valueIndex: true
      },
      key: {
        columnName: "key",
        columnType: "VARCHAR(50)",
        description: "设置键名",
        examples: ["site_name", "maintenance_mode"],
        enabled: true,
        valueIndex: false
      },
      value: {
        columnName: "value",
        columnType: "TEXT",
        description: "设置值",
        examples: ["My E-commerce Site", "false"],
        enabled: true,
        valueIndex: false
      },
      description: {
        columnName: "description",
        columnType: "VARCHAR(200)",
        description: "设置描述",
        examples: ["The name of the website", "Whether the site is in maintenance mode"],
        enabled: true,
        valueIndex: false
      }
    }
  },
  {
    tableName: "tags",
    description: "商品标签表",
    enabled: true,
    columns: {
      tag_id: {
        columnName: "tag_id",
        columnType: "VARCHAR(36)",
        description: "标签唯一标识符",
        examples: ["tag_001", "tag_002"],
        enabled: true,
        valueIndex: true
      },
      name: {
        columnName: "name",
        columnType: "VARCHAR(30)",
        description: "标签名称",
        examples: ["electronics", "clothing"],
        enabled: true,
        valueIndex: false
      },
      color: {
        columnName: "color",
        columnType: "VARCHAR(7)",
        description: "标签颜色",
        examples: ["#FF5733", "#33FF57"],
        enabled: true,
        valueIndex: false
      }
    }
  },
  {
    tableName: "product_tags",
    description: "商品标签关联表",
    enabled: true,
    columns: {
      product_id: {
        columnName: "product_id",
        columnType: "VARCHAR(36)",
        description: "商品ID",
        examples: ["prod_001", "prod_002"],
        enabled: true,
        valueIndex: true
      },
      tag_id: {
        columnName: "tag_id",
        columnType: "VARCHAR(36)",
        description: "标签ID",
        examples: ["tag_001", "tag_002"],
        enabled: true,
        valueIndex: true
      }
    }
  },
]