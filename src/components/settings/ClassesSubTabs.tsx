import { useState } from "react";
import { Plus, Layers, Tag, Folder, GripVertical, Pencil, Trash2, Search, MoreHorizontal, Copy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { ColorPicker } from "@/components/ui/color-picker";
import type { CustomStatus } from "@/hooks/useCustomStatuses";
import type { Tag as TagType } from "@/hooks/useTags";
import type { Department } from "@/hooks/useDepartments";

interface ClassesSubTabsProps {
  statuses: CustomStatus[];
  createStatus: any;
  updateStatus: any;
  deleteStatus: any;
  statusDialogOpen: boolean;
  setStatusDialogOpen: (open: boolean) => void;
  newStatusName: string;
  setNewStatusName: (name: string) => void;
  newStatusColor: string;
  setNewStatusColor: (color: string) => void;
  handleCreateStatus: () => void;
  tags: TagType[];
  createTag: any;
  updateTag: any;
  deleteTag: any;
  tagDialogOpen: boolean;
  setTagDialogOpen: (open: boolean) => void;
  newTagName: string;
  setNewTagName: (name: string) => void;
  newTagColor: string;
  setNewTagColor: (color: string) => void;
  handleCreateTag: () => void;
  departments: Department[];
  createDepartment: any;
  updateDepartment: any;
  deleteDepartment: any;
  deptDialogOpen: boolean;
  setDeptDialogOpen: (open: boolean) => void;
  newDeptName: string;
  setNewDeptName: (name: string) => void;
  newDeptColor: string;
  setNewDeptColor: (color: string) => void;
  handleCreateDepartment: () => void;
  draggedDept: string | null;
  handleDeptDragStart: (id: string) => void;
  handleDeptDragOver: (e: React.DragEvent) => void;
  handleDeptDrop: (targetId: string) => void;
}

export function ClassesSubTabs({
  statuses,
  createStatus,
  updateStatus,
  deleteStatus,
  statusDialogOpen,
  setStatusDialogOpen,
  newStatusName,
  setNewStatusName,
  newStatusColor,
  setNewStatusColor,
  handleCreateStatus,
  tags,
  createTag,
  updateTag,
  deleteTag,
  tagDialogOpen,
  setTagDialogOpen,
  newTagName,
  setNewTagName,
  newTagColor,
  setNewTagColor,
  handleCreateTag,
  departments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  deptDialogOpen,
  setDeptDialogOpen,
  newDeptName,
  setNewDeptName,
  newDeptColor,
  setNewDeptColor,
  handleCreateDepartment,
  draggedDept,
  handleDeptDragStart,
  handleDeptDragOver,
  handleDeptDrop,
}: ClassesSubTabsProps) {
  const [statusSearch, setStatusSearch] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [deptSearch, setDeptSearch] = useState("");
  const [editingStatus, setEditingStatus] = useState<CustomStatus | null>(null);
  const [editingTag, setEditingTag] = useState<TagType | null>(null);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const filteredStatuses = statuses.filter(s => 
    s.name.toLowerCase().includes(statusSearch.toLowerCase())
  );
  
  const filteredTags = tags.filter(t => 
    t.name.toLowerCase().includes(tagSearch.toLowerCase())
  );
  
  const filteredDepts = departments.filter(d => 
    d.name.toLowerCase().includes(deptSearch.toLowerCase())
  );

  const openEditStatus = (status: CustomStatus) => {
    setEditingStatus(status);
    setEditName(status.name);
    setEditColor(status.color);
    setEditDescription("");
  };

  const openEditTag = (tag: TagType) => {
    setEditingTag(tag);
    setEditName(tag.name);
    setEditColor(tag.color);
    setEditDescription("");
  };

  const openEditDept = (dept: Department) => {
    setEditingDept(dept);
    setEditName(dept.name);
    setEditColor(dept.color);
    setEditDescription("");
  };

  const saveEditStatus = () => {
    if (editingStatus && editName.trim()) {
      updateStatus.mutate({ id: editingStatus.id, name: editName, color: editColor });
      setEditingStatus(null);
    }
  };

  const saveEditTag = () => {
    if (editingTag && editName.trim()) {
      updateTag.mutate({ id: editingTag.id, name: editName, color: editColor });
      setEditingTag(null);
    }
  };

  const saveEditDept = () => {
    if (editingDept && editName.trim()) {
      updateDepartment.mutate({ id: editingDept.id, name: editName, color: editColor });
      setEditingDept(null);
    }
  };

  return (
    <Tabs defaultValue="status" className="w-full">
      <TabsList className="w-fit bg-muted/50 p-1 rounded-lg">
        <TabsTrigger value="status" className="data-[state=active]:bg-background">
          Status
        </TabsTrigger>
        <TabsTrigger value="etiquetas" className="data-[state=active]:bg-background">
          Etiquetas
        </TabsTrigger>
        <TabsTrigger value="departamento" className="data-[state=active]:bg-background">
          Departamento
        </TabsTrigger>
      </TabsList>

      {/* Status Tab */}
      <TabsContent value="status" className="mt-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold">Status</h3>
          <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Criar Status
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Status</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Nome do Status</Label>
                  <Input
                    value={newStatusName}
                    onChange={(e) => setNewStatusName(e.target.value)}
                    placeholder="Ex: Qualificado"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cor</Label>
                  <ColorPicker value={newStatusColor} onChange={setNewStatusColor} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreateStatus} disabled={createStatus.isPending}>
                    {createStatus.isPending ? "Criando..." : "Criar"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar status ou follow-up"
              value={statusSearch}
              onChange={(e) => setStatusSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button variant="outline" className="gap-2">
            <Folder className="h-4 w-4" />
            Departamento
          </Button>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-10">
                  <Checkbox />
                </TableHead>
                <TableHead className="w-10"></TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Departamento</TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Users className="h-4 w-4" />
                    Contatos
                  </div>
                </TableHead>
                <TableHead className="text-center">Follow Up</TableHead>
                <TableHead className="text-center">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStatuses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    <Layers className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhum status criado</p>
                    <p className="text-sm">Clique em "Criar Status" para adicionar</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredStatuses.map((status) => (
                  <TableRow key={status.id}>
                    <TableCell>
                      <Checkbox />
                    </TableCell>
                    <TableCell>
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                    </TableCell>
                    <TableCell>
                      <Badge 
                        style={{ 
                          backgroundColor: `${status.color}20`, 
                          color: status.color,
                          borderColor: status.color 
                        }}
                        variant="outline"
                        className="font-medium"
                      >
                        <span 
                          className="w-2 h-2 rounded-full mr-2"
                          style={{ backgroundColor: status.color }}
                        />
                        {status.name}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">-</TableCell>
                    <TableCell className="text-muted-foreground">-</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1 text-muted-foreground">
                        <Users className="h-4 w-4" />
                        0
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1 text-muted-foreground">
                        <Checkbox disabled />
                        0
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditStatus(status)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => deleteStatus.mutate(status.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Edit Status Dialog */}
        <Dialog open={!!editingStatus} onOpenChange={(open) => !open && setEditingStatus(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Status</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Nome do Status</Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Cor</Label>
                <ColorPicker value={editColor} onChange={setEditColor} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingStatus(null)}>
                  Cancelar
                </Button>
                <Button onClick={saveEditStatus} disabled={updateStatus.isPending}>
                  {updateStatus.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </TabsContent>

      {/* Etiquetas Tab */}
      <TabsContent value="etiquetas" className="mt-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold">Etiquetas</h3>
          <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Criar Etiqueta
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Etiqueta</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Nome da Etiqueta</Label>
                  <Input
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="Ex: VIP"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cor</Label>
                  <ColorPicker value={newTagColor} onChange={setNewTagColor} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setTagDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreateTag} disabled={createTag.isPending}>
                    {createTag.isPending ? "Criando..." : "Criar"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar etiquetas"
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-10">
                  <Checkbox />
                </TableHead>
                <TableHead className="w-10"></TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Users className="h-4 w-4" />
                    Contatos
                  </div>
                </TableHead>
                <TableHead className="text-center">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTags.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhuma etiqueta criada</p>
                    <p className="text-sm">Clique em "Criar Etiqueta" para adicionar</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredTags.map((tag) => (
                  <TableRow key={tag.id}>
                    <TableCell>
                      <Checkbox />
                    </TableCell>
                    <TableCell>
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                    </TableCell>
                    <TableCell>
                      <Badge 
                        style={{ 
                          backgroundColor: `${tag.color}20`, 
                          color: tag.color,
                          borderColor: tag.color 
                        }}
                        variant="outline"
                        className="font-medium"
                      >
                        <span 
                          className="w-2 h-2 rounded-full mr-2"
                          style={{ backgroundColor: tag.color }}
                        />
                        {tag.name}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">-</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1 text-muted-foreground">
                        <Users className="h-4 w-4" />
                        0
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditTag(tag)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => deleteTag.mutate(tag.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Edit Tag Dialog */}
        <Dialog open={!!editingTag} onOpenChange={(open) => !open && setEditingTag(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Etiqueta</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Nome da Etiqueta</Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Cor</Label>
                <ColorPicker value={editColor} onChange={setEditColor} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingTag(null)}>
                  Cancelar
                </Button>
                <Button onClick={saveEditTag} disabled={updateTag.isPending}>
                  {updateTag.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </TabsContent>

      {/* Departamento Tab */}
      <TabsContent value="departamento" className="mt-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold">Departamentos</h3>
          <Dialog open={deptDialogOpen} onOpenChange={setDeptDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Criar Departamento
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Departamento</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Nome do Departamento</Label>
                  <Input
                    value={newDeptName}
                    onChange={(e) => setNewDeptName(e.target.value)}
                    placeholder="Ex: Comercial"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cor</Label>
                  <ColorPicker value={newDeptColor} onChange={setNewDeptColor} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDeptDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreateDepartment} disabled={createDepartment.isPending}>
                    {createDepartment.isPending ? "Criando..." : "Criar"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar departamentos"
              value={deptSearch}
              onChange={(e) => setDeptSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-10">
                  <Checkbox />
                </TableHead>
                <TableHead className="w-10"></TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Users className="h-4 w-4" />
                    Contatos
                  </div>
                </TableHead>
                <TableHead className="text-center">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDepts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <Folder className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhum departamento criado</p>
                    <p className="text-sm">Clique em "Criar Departamento" para adicionar</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredDepts.map((dept) => (
                  <TableRow 
                    key={dept.id}
                    draggable
                    onDragStart={() => handleDeptDragStart(dept.id)}
                    onDragOver={handleDeptDragOver}
                    onDrop={() => handleDeptDrop(dept.id)}
                    className={`${draggedDept === dept.id ? "opacity-50" : ""}`}
                  >
                    <TableCell>
                      <Checkbox />
                    </TableCell>
                    <TableCell>
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing" />
                    </TableCell>
                    <TableCell>
                      <Badge 
                        style={{ 
                          backgroundColor: `${dept.color}20`, 
                          color: dept.color,
                          borderColor: dept.color 
                        }}
                        variant="outline"
                        className="font-medium"
                      >
                        <span 
                          className="w-2 h-2 rounded-full mr-2"
                          style={{ backgroundColor: dept.color }}
                        />
                        {dept.name}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">-</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1 text-muted-foreground">
                        <Users className="h-4 w-4" />
                        0
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDept(dept)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => deleteDepartment.mutate(dept.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Edit Department Dialog */}
        <Dialog open={!!editingDept} onOpenChange={(open) => !open && setEditingDept(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Departamento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Nome do Departamento</Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Cor</Label>
                <ColorPicker value={editColor} onChange={setEditColor} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingDept(null)}>
                  Cancelar
                </Button>
                <Button onClick={saveEditDept} disabled={updateDepartment.isPending}>
                  {updateDepartment.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </TabsContent>
    </Tabs>
  );
}
