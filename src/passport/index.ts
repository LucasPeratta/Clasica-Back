import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";
import bcrypt from "bcrypt";
import { prisma } from "../db";

// Configuración de Passport LOGIN
passport.use(
  "local-signin",
  new LocalStrategy(
    {
      usernameField: "email",
      passReqToCallback: true,
    },
    async (req, email, password, done) => {
      try {
        // Buscar el usuario en la base de datos
        const user = await prisma.user.findUnique({ where: { email } });

        // Si el usuario no existe o la contraseña es incorrecta, devolver un error
        if (!user || !(await bcrypt.compare(password, user.password))) {
          return done(null, false, {
            message: "Email o contraseña incorrecta",
          });
        }

        // Si todo está bien, devolver el usuario
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  )
);

// Configuración de Passport REGISTER
passport.use(
  "local-signup",
  new LocalStrategy(
    {
      usernameField: "email",
      passReqToCallback: true,
    },
    async (req, email, password, done) => {
      try {
        // Verificar si el correo electrónico ya está en uso
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
          return done(null, false, {
            message: "Este correo electrónico ya está en uso",
          });
        }
        // Crear el nuevo usuario
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await prisma.user.create({
          data: { email, password: hashedPassword },
        });
        // Devolver el nuevo usuario
        return done(null, newUser);
      } catch (error) {
        return done(error);
      }
    }
  )
);

const secretKey = process.env.SECRET_KEY;

// Configuración de Passport protected
passport.use(
  "jwt",
  new JwtStrategy(
    {
      // Esta opción indica que el JWT se encuentra en el encabezado "Authorization"
      // como un token de portador (Bearer token).
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // Esta es la clave secreta que se utiliza para firmar el JWT.
      secretOrKey: secretKey,
    },
    async (jwtPayload, done) => {
      try {
        // Buscar al usuario correspondiente al ID del JWT en la base de datos.
        const existingUser = await prisma.user.findUnique({
          where: { id: jwtPayload.id },
        });
        // Si no se encuentra el usuario, se devuelve `false` en el segundo
        // argumento de la función `done()`.
        if (!existingUser) {
          return done(null, false);
        }
        // Si se encuentra el usuario, se devuelve como segundo argumento de
        // la función `done()`.
        return done(null, existingUser);
      } catch (error) {
        // Si ocurre algún error, se devuelve como primer argumento de la
        // función `done()` y se pasa `false` como segundo argumento.
        return done(error, false);
      }
    }
  )
);

export default passport;
