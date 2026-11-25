import { Module, forwardRef } from '@nestjs/common'
import { TasksService } from './tasks.service'
import { TasksController } from './tasks.controller'
import { TaskTransitionService } from './task-transition.service'
import { PerformanceModule } from '../performance/performance.module'

@Module({
  imports: [forwardRef(() => PerformanceModule)],
  controllers: [TasksController],
  providers: [TasksService, TaskTransitionService],
  exports: [TasksService, TaskTransitionService],
})
export class TasksModule {}
