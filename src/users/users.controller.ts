import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLE } from '@prisma/client';
import { ResponseHelper } from '../common/helpers/response.helper';
import { UsersQueryDto } from './dto/users-query.dto';

/**
 * UsersController gère toutes les routes liées aux utilisateurs.
 * Toutes les routes sont protégées par JwtAuthGuard et RolesGuard.
 * Seul l'Admin peut accéder à ces routes.
 */
@Controller('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /api/v1/users
   * Liste tous les utilisateurs
   * Accessible uniquement par ADMIN
   */
  @Get()
  @Roles(ROLE.ADMIN)
  async findAll(@Query() query: UsersQueryDto) {
    const data = await this.usersService.findAll(query);
    return ResponseHelper.success(data);
  }

  /**
   * GET /api/v1/users/:id
   * Détail d'un utilisateur
   * Accessible uniquement par ADMIN
   */
  @Get(':id')
  @Roles(ROLE.ADMIN)
  async findOne(@Param('id') id: string) {
    const data = await this.usersService.findOne(id);
    return ResponseHelper.success(data);
  }

  /**
   * POST /api/v1/users
   * Créer un nouvel utilisateur
   * Accessible uniquement par ADMIN
   * Un mot de passe temporaire Odc@1234 est généré automatiquement
   * L'utilisateur devra le changer à sa première connexion
   */
  @Post()
  @Roles(ROLE.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createUserDto: CreateUserDto) {
    const data = await this.usersService.create(createUserDto);
    return ResponseHelper.success(data, 'Utilisateur créé avec succès');
  }

  /**
   * PUT /api/v1/users/:id
   * Modifier un utilisateur existant
   * Accessible uniquement par ADMIN
   */
  @Put(':id')
  @Roles(ROLE.ADMIN)
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    const data = await this.usersService.update(id, updateUserDto);
    return ResponseHelper.success(data, 'Utilisateur modifié avec succès');
  }

  /**
   * DELETE /api/v1/users/:id
   * Désactiver un utilisateur (soft delete)
   * Accessible uniquement par ADMIN
   * On ne supprime jamais physiquement un utilisateur
   */
  @Delete(':id')
  @Roles(ROLE.ADMIN)
  async remove(@Param('id') id: string) {
    const data = await this.usersService.remove(id);
    return ResponseHelper.success(data);
  }
}
