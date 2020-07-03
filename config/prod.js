module.exports = {
    MongoDB: process.env.DB_MONGO,
    AWSAccessKeyID: process.env.AWS_ACCESS_KEY, 
    AWSAccessKeySecret: process.env.AWS_ACCESS_SECRET,
    StripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    StripeSecretkey: process.env.STRIPE_SECRET_KEY
};