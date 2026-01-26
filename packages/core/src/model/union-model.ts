// TODO: Implement this

/**
 * 
 * File to define a union model class.
 *
 * This type of model will have a different structure depending on the value of a given "discriminator" key.
 *
 * The class should consist of 3 main components:
 *  1. The key of each document that will be used as the discriminator, as a string.
 *  2. A base document that MUST house the primary key definition. It can also house additional fields.
 *  3. An array of different possible documents. Each document must contain the discriminator key and a unique, LITERAL value associated with it.
 *
 * Some things will need to be accounted for:
 *  1. Relations can be in the options array, this means that additional checks need to be made when 
 *      connected/creating documents that the discriminator key is correct.
 *  2. I'm not even sure if this is possible with the TS type system.
 */
